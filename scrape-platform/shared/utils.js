/**
 * Utility Functions
 * Shared helper functions across the platform
 */

/**
 * Generate a unique ID
 */
export function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `${prefix}${timestamp}-${randomPart}`;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Debounce function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function
 */
export function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Deep clone an object
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Safely get nested property
 */
export function getNestedProperty(obj, path, defaultValue = undefined) {
  return path.split('.').reduce((acc, part) => {
    return acc && acc[part] !== undefined ? acc[part] : defaultValue;
  }, obj);
}

/**
 * Truncate string to max length
 */
export function truncate(str, maxLength, suffix = '...') {
  if (!str || str.length <= maxLength) return str;
  return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Sanitize string for safe use
 */
export function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Parse URL safely
 */
export function parseUrl(urlString) {
  try {
    return new URL(urlString);
  } catch (e) {
    return null;
  }
}

/**
 * Get domain from URL
 */
export function getDomain(url) {
  const parsed = parseUrl(url);
  return parsed ? parsed.hostname : null;
}

/**
 * Check if URL matches pattern
 */
export function urlMatches(url, pattern) {
  if (pattern === '<all_urls>') return true;
  
  // Handle wildcard patterns
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(url);
  }
  
  return url === pattern;
}

/**
 * Chunk array into smaller arrays
 */
export function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Retry async function with exponential backoff
 */
export async function retryAsync(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    onRetry = null
  } = options;

  let lastError;
  let delay = baseDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxAttempts) {
        if (onRetry) {
          await onRetry(error, attempt, maxAttempts);
        }
        
        await sleep(delay);
        delay = Math.min(delay * backoffMultiplier, maxDelay);
      }
    }
  }

  throw lastError;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Create a deferred promise
 */
export function createDeferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Check if value is a plain object
 */
export function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

/**
 * Merge objects deeply
 */
export function deepMerge(target, source) {
  const output = Object.assign({}, target);
  
  if (isPlainObject(target) && isPlainObject(source)) {
    Object.keys(source).forEach(key => {
      if (isPlainObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  
  return output;
}

/**
 * Extract text content from HTML element
 */
export function extractTextContent(element) {
  if (!element) return '';
  return element.textContent?.trim() || '';
}

/**
 * Wait for condition to be true
 */
export async function waitForCondition(conditionFn, timeout = 10000, interval = 100) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (conditionFn()) {
      return true;
    }
    await sleep(interval);
  }
  
  return false;
}

/**
 * Batch process items
 */
export async function batchProcess(items, processor, batchSize = 10) {
  const results = [];
  const batches = chunkArray(items, batchSize);
  
  for (const batch of batches) {
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  
  return results;
}

export default {
  generateId,
  sleep,
  debounce,
  throttle,
  deepClone,
  getNestedProperty,
  truncate,
  sanitizeString,
  parseUrl,
  getDomain,
  urlMatches,
  chunkArray,
  retryAsync,
  formatBytes,
  formatDuration,
  createDeferred,
  isPlainObject,
  deepMerge,
  extractTextContent,
  waitForCondition,
  batchProcess
};
