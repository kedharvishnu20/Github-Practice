/**
 * Data Streaming Module
 * Handles streaming export of large datasets without loading everything into memory
 */

import Logger from '../shared/logger.js';

const logger = new Logger({ module: 'data-stream' });

class DataStreamer {
  constructor(options = {}) {
    this.options = {
      chunkSize: options.chunkSize ?? 100,
      flushInterval: options.flushInterval ?? 5000,
      maxBufferSize: options.maxBufferSize ?? 1000,
      format: options.format ?? 'json', // json, csv, ndjson
      destination: options.destination ?? 'download', // download, callback, storage
      onChunk: options.onChunk || null,
      ...options
    };

    this.buffer = [];
    this.totalWritten = 0;
    this.streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.isStreaming = false;
    this.flushTimer = null;
    this.chunks = [];
    this.metadata = {
      startTime: null,
      endTime: null,
      recordCount: 0,
      errorCount: 0
    };
  }

  /**
   * Start streaming session
   */
  start() {
    if (this.isStreaming) {
      throw new Error('Stream already started');
    }

    this.isStreaming = true;
    this.metadata.startTime = Date.now();
    this.buffer = [];
    this.totalWritten = 0;
    this.chunks = [];
    this.metadata.recordCount = 0;
    this.metadata.errorCount = 0;

    // Start auto-flush timer
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        this._flush();
      }
    }, this.options.flushInterval);

    logger.info(`Stream ${this.streamId} started`);
    return this;
  }

  /**
   * Write data to stream
   */
  async write(data) {
    if (!this.isStreaming) {
      throw new Error('Stream not started. Call start() first.');
    }

    const items = Array.isArray(data) ? data : [data];
    
    for (const item of items) {
      this.buffer.push(item);
      this.metadata.recordCount++;

      // Flush if buffer is full
      if (this.buffer.length >= this.options.chunkSize) {
        await this._flush();
      }
    }

    return { written: items.length, buffered: this.buffer.length };
  }

  /**
   * Write with transformation
   */
  async writeWithTransform(data, transformFn) {
    if (!this.isStreaming) {
      throw new Error('Stream not started');
    }

    const items = Array.isArray(data) ? data : [data];
    const transformed = [];

    for (const item of items) {
      try {
        const result = await transformFn(item);
        if (result !== null && result !== undefined) {
          transformed.push(result);
        }
      } catch (error) {
        this.metadata.errorCount++;
        logger.warn('Transform failed for item', error);
      }
    }

    return this.write(transformed);
  }

  /**
   * Flush buffer to destination
   */
  async _flush(force = false) {
    if (this.buffer.length === 0 && !force) {
      return { flushed: 0 };
    }

    const chunk = [...this.buffer];
    this.buffer = [];

    let formatted;
    try {
      formatted = this._formatChunk(chunk);
    } catch (error) {
      logger.error('Failed to format chunk', error);
      this.metadata.errorCount++;
      return { flushed: 0, error: error.message };
    }

    // Send to destination
    switch (this.options.destination) {
      case 'download':
        await this._flushToDownload(formatted, chunk.length);
        break;
      case 'callback':
        if (this.options.onChunk) {
          await this.options.onChunk(formatted, chunk, this);
        }
        break;
      case 'storage':
        await this._flushToStorage(formatted, chunk.length);
        break;
      default:
        // Just track chunks in memory
        this.chunks.push(formatted);
    }

    this.totalWritten += chunk.length;
    logger.debug(`Flushed ${chunk.length} records, total: ${this.totalWritten}`);

    return { flushed: chunk.length };
  }

  /**
   * Format chunk based on output format
   */
  _formatChunk(chunk) {
    switch (this.options.format) {
      case 'csv':
        return this._toCSV(chunk);
      case 'ndjson':
        return chunk.map(row => JSON.stringify(row)).join('\n') + '\n';
      case 'json':
      default:
        return JSON.stringify(chunk, null, 2);
    }
  }

  /**
   * Convert chunk to CSV
   */
  _toCSV(chunk) {
    if (chunk.length === 0) return '';

    // Get all unique headers
    const headers = Array.from(
      chunk.reduce((set, row) => {
        Object.keys(row).forEach(key => set.add(key));
        return set;
      }, new Set())
    );

    // Build CSV
    const escapeValue = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headerRow = headers.join(',');
    const dataRows = chunk.map(row => 
      headers.map(h => escapeValue(row[h])).join(',')
    );

    return [headerRow, ...dataRows].join('\n') + '\n';
  }

  /**
   * Flush to download (browser)
   */
  async _flushToDownload(content, count) {
    // For streaming downloads, we append to a blob
    const isFirstChunk = this.chunks.length === 0;
    
    if (isFirstChunk) {
      // Create initial blob with headers for CSV
      if (this.options.format === 'csv') {
        const headers = Object.keys(this.buffer[0] || {});
        const headerRow = headers.join(',');
        content = headerRow + '\n' + content;
      }
    }

    this.chunks.push(content);

    // Trigger download for each chunk (or batch them)
    const fullContent = this.chunks.join(this.options.format === 'json' ? ',\n' : '');
    const mimeType = this._getMimeType();
    
    // Debounced download trigger
    if (this.downloadTimeout) {
      clearTimeout(this.downloadTimeout);
    }

    this.downloadTimeout = setTimeout(() => {
      this._triggerDownload(fullContent, mimeType);
    }, 1000);
  }

  /**
   * Trigger file download
   */
  _triggerDownload(content, mimeType) {
    if (typeof window === 'undefined') return;

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this._generateFilename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Flush to storage (IndexedDB or similar)
   */
  async _flushToStorage(content, count) {
    // Implementation depends on storage backend
    // This is a placeholder for IndexedDB or other storage
    if (typeof indexedDB !== 'undefined') {
      return this._flushToIndexedDB(content, count);
    }
    
    logger.warn('No storage backend available');
    this.chunks.push(content);
  }

  /**
   * Flush to IndexedDB
   */
  async _flushToIndexedDB(content, count) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ScrapePlatform', 1);

      request.onerror = () => reject(request.error);
      
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('streams')) {
          db.createObjectStore('streams', { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('streams', 'readwrite');
        const store = tx.objectStore('streams');

        store.put({
          id: this.streamId,
          chunk: content,
          count,
          timestamp: Date.now()
        });

        tx.oncomplete = () => resolve({ stored: count });
        tx.onerror = () => reject(tx.error);
      };
    });
  }

  /**
   * Stop streaming and finalize
   */
  async stop(finalize = true) {
    if (!this.isStreaming) {
      return { totalWritten: this.totalWritten };
    }

    // Clear flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush remaining buffer
    if (this.buffer.length > 0) {
      await this._flush(true);
    }

    // Finalize
    if (finalize) {
      await this._finalize();
    }

    this.isStreaming = false;
    this.metadata.endTime = Date.now();

    logger.info(`Stream ${this.streamId} stopped. Total records: ${this.totalWritten}`);

    return {
      totalWritten: this.totalWritten,
      duration: this.metadata.endTime - this.metadata.startTime,
      chunks: this.chunks.length
    };
  }

  /**
   * Finalize stream (close brackets, etc.)
   */
  async _finalize() {
    if (this.options.format === 'json' && this.options.destination === 'download') {
      // For JSON, we need to close the array
      // This is handled in the download trigger
    }
  }

  /**
   * Get MIME type for format
   */
  _getMimeType() {
    switch (this.options.format) {
      case 'csv':
        return 'text/csv';
      case 'ndjson':
        return 'application/x-ndjson';
      case 'json':
      default:
        return 'application/json';
    }
  }

  /**
   * Generate filename
   */
  _generateFilename() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const ext = this.options.format === 'ndjson' ? 'ndjson' : this.options.format;
    return `scrape-data-${timestamp}.${ext}`;
  }

  /**
   * Get stream statistics
   */
  getStats() {
    return {
      streamId: this.streamId,
      isStreaming: this.isStreaming,
      totalWritten: this.totalWritten,
      buffered: this.buffer.length,
      chunks: this.chunks.length,
      metadata: {
        ...this.metadata,
        duration: this.metadata.startTime 
          ? (this.metadata.endTime || Date.now()) - this.metadata.startTime 
          : 0
      }
    };
  }

  /**
   * Pipe to another stream
   */
  pipe(destination) {
    this.options.onChunk = async (formatted, chunk, streamer) => {
      if (destination.write) {
        await destination.write(chunk);
      }
    };
    return destination;
  }

  /**
   * Batch process with backpressure
   */
  async processBatch(items, processor, concurrency = 5) {
    const results = [];
    
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(processor));
      results.push(...batchResults.filter(r => r !== null));
      
      // Write results to stream
      await this.write(results.splice(0, this.options.chunkSize));
    }

    return results;
  }
}

/**
 * Async iterator for consuming streams
 */
class StreamConsumer {
  constructor(streamer) {
    this.streamer = streamer;
  }

  async *[Symbol.asyncIterator]() {
    while (this.streamer.isStreaming || this.streamer.buffer.length > 0) {
      if (this.streamer.buffer.length >= this.streamer.options.chunkSize) {
        const chunk = [...this.streamer.buffer];
        this.streamer.buffer = [];
        yield chunk;
      } else {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
}

export default DataStreamer;
export { StreamConsumer };
