/**
 * Performance Optimizer Module
 * Advanced caching, batching, and performance monitoring for scraping
 */

import Logger from '../shared/logger.js';

const logger = new Logger({ module: 'performance' });

class PerformanceOptimizer {
  constructor(options = {}) {
    this.options = {
      cacheEnabled: options.cacheEnabled ?? true,
      cacheMaxSize: options.cacheMaxSize ?? 1000,
      cacheTTL: options.cacheTTL ?? 300000, // 5 minutes
      batchEnabled: options.batchEnabled ?? true,
      batchSize: options.batchSize ?? 10,
      batchDelay: options.batchDelay ?? 100,
      compressionEnabled: options.compressionEnabled ?? false,
      metricsEnabled: options.metricsEnabled ?? true,
      ...options
    };

    // Multi-level cache
    this.l1Cache = new Map(); // In-memory fast cache
    this.l2Cache = new Map(); // Larger secondary cache
    this.cacheStats = {
      l1Hits: 0,
      l1Misses: 0,
      l2Hits: 0,
      l2Misses: 0,
      evictions: 0
    };

    // Batch queue
    this.batchQueue = [];
    this.batchTimer = null;

    // Metrics
    this.metrics = {
      operations: [],
      timings: [],
      memoryUsage: []
    };

    // Compression worker (if enabled)
    this.compressionWorker = null;
    if (this.options.compressionEnabled && typeof Worker !== 'undefined') {
      this._initCompressionWorker();
    }

    // Start memory monitoring
    if (this.options.metricsEnabled) {
      this._startMemoryMonitoring();
    }
  }

  /**
   * Get item from cache with L1/L2 hierarchy
   */
  async get(key, options = {}) {
    const startTime = performance.now();
    const { skipL1 = false, skipL2 = false } = options;

    // Check L1 cache
    if (!skipL1 && this.l1Cache.has(key)) {
      const item = this.l1Cache.get(key);
      
      // Check TTL
      if (item.expiry && Date.now() > item.expiry) {
        this.l1Cache.delete(key);
        this.cacheStats.evictions++;
      } else {
        this.cacheStats.l1Hits++;
        this._recordMetric('cache_get', performance.now() - startTime, { level: 'l1', hit: true });
        return item.data;
      }
    }

    this.cacheStats.l1Misses++;

    // Check L2 cache
    if (!skipL2 && this.l2Cache.has(key)) {
      const item = this.l2Cache.get(key);
      
      // Check TTL
      if (item.expiry && Date.now() > item.expiry) {
        this.l2Cache.delete(key);
        this.cacheStats.evictions++;
      } else {
        // Promote to L1
        this._setL1(key, item.data, item.expiry);
        this.cacheStats.l2Hits++;
        this._recordMetric('cache_get', performance.now() - startTime, { level: 'l2', hit: true });
        return item.data;
      }
    }

    this.cacheStats.l2Misses++;
    this._recordMetric('cache_get', performance.now() - startTime, { hit: false });
    
    return null;
  }

  /**
   * Set item in cache with automatic tiering
   */
  async set(key, data, options = {}) {
    const {
      ttl = this.options.cacheTTL,
      priority = 'normal', // 'high', 'normal', 'low'
      size = 1
    } = options;

    const expiry = ttl ? Date.now() + ttl : null;
    const item = { data, expiry, size, timestamp: Date.now() };

    // High priority items go to L1
    if (priority === 'high' || size <= 10) {
      this._setL1(key, data, expiry);
    } else {
      // Larger items go to L2
      this._setL2(key, item);
    }

    this._recordMetric('cache_set', 0, { key, size, priority });
  }

  /**
   * Set item in L1 cache with size management
   */
  _setL1(key, data, expiry) {
    // Evict oldest if at capacity
    if (this.l1Cache.size >= this.options.cacheMaxSize) {
      const firstKey = this.l1Cache.keys().next().value;
      this.l1Cache.delete(firstKey);
      this.cacheStats.evictions++;
    }

    this.l1Cache.set(key, { data, expiry, timestamp: Date.now() });
  }

  /**
   * Set item in L2 cache with size management
   */
  _setL2(key, item) {
    const maxSize = this.options.cacheMaxSize * 2;
    
    if (this.l2Cache.size >= maxSize) {
      // Evict lowest priority or oldest items
      let oldestKey = null;
      let oldestTime = Infinity;

      for (const [k, v] of this.l2Cache.entries()) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp;
          oldestKey = k;
        }
      }

      if (oldestKey) {
        this.l2Cache.delete(oldestKey);
        this.cacheStats.evictions++;
      }
    }

    this.l2Cache.set(key, item);
  }

  /**
   * Batch multiple operations for efficiency
   */
  async batch(operation, items, options = {}) {
    if (!this.options.batchEnabled) {
      // Execute immediately without batching
      return Promise.all(items.map(item => operation(item)));
    }

    const { 
      flushOnComplete = true,
      maxBatchSize = this.options.batchSize 
    } = options;

    return new Promise((resolve, reject) => {
      // Add items to queue
      this.batchQueue.push({
        operation,
        items,
        resolve,
        reject,
        timestamp: Date.now()
      });

      // Flush timer
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
      }

      this.batchTimer = setTimeout(() => {
        this._flushBatch(maxBatchSize);
      }, this.options.batchDelay);

      // Immediate flush if queue is large enough
      if (this.batchQueue.length >= maxBatchSize) {
        this._flushBatch(maxBatchSize);
      }
    });
  }

  /**
   * Flush batch queue
   */
  async _flushBatch(maxBatchSize) {
    if (this.batchQueue.length === 0) return;

    // Group by operation type
    const batches = new Map();
    
    for (const job of this.batchQueue) {
      const opKey = job.operation.name || 'anonymous';
      if (!batches.has(opKey)) {
        batches.set(opKey, []);
      }
      batches.get(opKey).push(job);
    }

    // Process each batch
    const promises = [];
    
    for (const [opKey, jobs] of batches.entries()) {
      // Split into chunks
      const allItems = jobs.flatMap(j => j.items);
      const chunks = this._chunkArray(allItems, maxBatchSize);

      for (const chunk of chunks) {
        const operation = jobs[0].operation;
        const promise = operation(chunk)
          .then(results => {
            // Distribute results back to original jobs
            let resultIndex = 0;
            for (const job of jobs) {
              const jobResults = results.slice(resultIndex, resultIndex + job.items.length);
              job.resolve(jobResults);
              resultIndex += job.items.length;
            }
          })
          .catch(error => {
            for (const job of jobs) {
              job.reject(error);
            }
          });

        promises.push(promise);
      }
    }

    this.batchQueue = [];
    await Promise.all(promises);
  }

  /**
   * Compress data (if compression enabled)
   */
  async compress(data) {
    if (!this.options.compressionEnabled) {
      return data;
    }

    try {
      if (typeof CompressionStream !== 'undefined') {
        // Browser compression API
        const blob = new Blob([JSON.stringify(data)]);
        const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
        const compressedBlob = await new Response(stream).blob();
        return await compressedBlob.arrayBuffer();
      } else if (this.compressionWorker) {
        // Worker-based compression
        return new Promise((resolve, reject) => {
          this.compressionWorker.postMessage({ action: 'compress', data });
          this.compressionWorker.onmessage = (e) => resolve(e.data);
          this.compressionWorker.onerror = reject;
        });
      }
    } catch (error) {
      logger.warn('Compression failed, using uncompressed data', error);
    }

    return data;
  }

  /**
   * Decompress data
   */
  async decompress(compressedData) {
    if (!this.options.compressionEnabled) {
      return compressedData;
    }

    try {
      if (typeof DecompressionStream !== 'undefined') {
        const blob = new Blob([compressedData]);
        const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
        const text = await new Response(stream).text();
        return JSON.parse(text);
      } else if (this.compressionWorker) {
        return new Promise((resolve, reject) => {
          this.compressionWorker.postMessage({ action: 'decompress', data: compressedData });
          this.compressionWorker.onmessage = (e) => resolve(e.data);
          this.compressionWorker.onerror = reject;
        });
      }
    } catch (error) {
      logger.warn('Decompression failed', error);
    }

    return compressedData;
  }

  /**
   * Initialize compression worker
   */
  _initCompressionWorker() {
    const workerCode = `
      self.onmessage = function(e) {
        const { action, data } = e.data;
        // Simple placeholder - real implementation would use pako or similar
        self.postMessage({ action, data });
      };
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    this.compressionWorker = new Worker(URL.createObjectURL(blob));
  }

  /**
   * Record performance metric
   */
  _recordMetric(operation, duration, metadata = {}) {
    if (!this.options.metricsEnabled) return;

    const metric = {
      operation,
      duration,
      timestamp: Date.now(),
      ...metadata
    };

    this.metrics.operations.push(metric);
    this.metrics.timings.push(duration);

    // Keep only last 1000 metrics
    if (this.metrics.operations.length > 1000) {
      this.metrics.operations.shift();
      this.metrics.timings.shift();
    }
  }

  /**
   * Start memory usage monitoring
   */
  _startMemoryMonitoring() {
    if (typeof performance !== 'undefined' && performance.memory) {
      setInterval(() => {
        this.metrics.memoryUsage.push({
          timestamp: Date.now(),
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize
        });

        // Keep only last 100 readings
        if (this.metrics.memoryUsage.length > 100) {
          this.metrics.memoryUsage.shift();
        }
      }, 5000);
    }
  }

  /**
   * Get performance statistics
   */
  getStats() {
    const timings = this.metrics.timings;
    
    return {
      cache: {
        ...this.cacheStats,
        l1Size: this.l1Cache.size,
        l2Size: this.l2Cache.size,
        hitRate: this._calculateHitRate()
      },
      performance: {
        totalOperations: this.metrics.operations.length,
        avgDuration: timings.length > 0 
          ? timings.reduce((a, b) => a + b, 0) / timings.length 
          : 0,
        minDuration: timings.length > 0 ? Math.min(...timings) : 0,
        maxDuration: timings.length > 0 ? Math.max(...timings) : 0,
        p95Duration: this._percentile(timings, 95),
        p99Duration: this._percentile(timings, 99)
      },
      memory: this.metrics.memoryUsage.length > 0
        ? this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1]
        : null,
      queue: {
        pendingJobs: this.batchQueue.length,
        isBatching: this.batchTimer !== null
      }
    };
  }

  /**
   * Calculate cache hit rate
   */
  _calculateHitRate() {
    const totalHits = this.cacheStats.l1Hits + this.cacheStats.l2Hits;
    const totalMisses = this.cacheStats.l1Misses + this.cacheStats.l2Misses;
    const total = totalHits + totalMisses;
    
    return total > 0 ? ((totalHits / total) * 100).toFixed(2) + '%' : '0%';
  }

  /**
   * Calculate percentile
   */
  _percentile(arr, p) {
    if (arr.length === 0) return 0;
    
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Chunk array
   */
  _chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.l1Cache.clear();
    this.l2Cache.clear();
    this.cacheStats = {
      l1Hits: 0,
      l1Misses: 0,
      l2Hits: 0,
      l2Misses: 0,
      evictions: 0
    };
  }

  /**
   * Clear metrics
   */
  clearMetrics() {
    this.metrics = {
      operations: [],
      timings: [],
      memoryUsage: []
    };
  }

  /**
   * Optimize DOM query with caching
   */
  async cachedQuerySelector(selector, context = document) {
    const cacheKey = `query:${selector}:${context === document ? 'doc' : context.id || 'el'}`;
    
    const cached = await this.get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const result = context.querySelector(selector);
    await this.set(cacheKey, result, { priority: 'high', ttl: 30000 });
    
    return result;
  }

  /**
   * Throttle function execution
   */
  throttle(fn, delay) {
    let lastCall = 0;
    let timeoutId = null;

    return (...args) => {
      const now = Date.now();
      const remaining = delay - (now - lastCall);

      if (remaining <= 0) {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        lastCall = now;
        return fn(...args);
      }

      if (!timeoutId) {
        timeoutId = setTimeout(() => {
          lastCall = Date.now();
          timeoutId = null;
          fn(...args);
        }, remaining);
      }
    };
  }

  /**
   * Memoize expensive function
   */
  memoize(fn, resolver = (...args) => JSON.stringify(args)) {
    const cache = new Map();

    return (...args) => {
      const key = resolver(...args);
      
      if (cache.has(key)) {
        return cache.get(key);
      }

      const result = fn(...args);
      cache.set(key, result);
      
      // Limit cache size
      if (cache.size > 1000) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }

      return result;
    };
  }

  /**
   * Debounce with immediate option
   */
  debounce(fn, wait, immediate = false) {
    let timeout;

    return function executedFunction(...args) {
      const context = this;
      const later = () => {
        timeout = null;
        if (!immediate) fn.apply(context, args);
      };

      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);

      if (callNow) fn.apply(context, args);
    };
  }
}

export default PerformanceOptimizer;
