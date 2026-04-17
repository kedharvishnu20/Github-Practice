/**
 * Rate Limiter
 * Manages request rate limiting with configurable delays
 */

import { CONSTANTS } from '../shared/constants.js';
import { sleep } from '../shared/utils.js';
import Logger from '../shared/logger.js';

const logger = new Logger({ module: 'rate-limiter' });

class RateLimiter {
  constructor(options = {}) {
    this.requestsPerMinute = options.requestsPerMinute || CONSTANTS.RATE_LIMIT.REQUESTS_PER_MINUTE;
    this.minDelay = options.minDelay || CONSTANTS.RATE_LIMIT.MIN_DELAY_MS;
    this.maxDelay = options.maxDelay || CONSTANTS.RATE_LIMIT.MAX_DELAY_MS;
    this.defaultDelay = options.defaultDelay || CONSTANTS.RATE_LIMIT.DEFAULT_DELAY_MS;
    
    // Per-domain rate limiting
    this.domainTimers = new Map();
    this.domainRequestCounts = new Map();
    
    // Global rate limiting
    this.globalTimers = [];
    this.globalRequestCount = 0;
    this.globalWindowStart = Date.now();
    
    // Jitter to avoid synchronized requests
    this.jitterRange = options.jitterRange || 0.2;
    
    logger.debug('Rate limiter initialized', {
      requestsPerMinute: this.requestsPerMinute,
      minDelay: this.minDelay,
      maxDelay: this.maxDelay
    });
  }

  /**
   * Get domain from URL
   */
  _getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return 'unknown';
    }
  }

  /**
   * Add jitter to delay
   */
  _addJitter(delay) {
    const jitter = delay * this.jitterRange * (Math.random() * 2 - 1);
    return Math.max(0, delay + jitter);
  }

  /**
   * Calculate delay based on request history
   */
  _calculateDelay(domain) {
    const now = Date.now();
    const windowMs = 60000; // 1 minute window
    
    // Get domain-specific request count
    const domainData = this.domainRequestCounts.get(domain) || { count: 0, windowStart: now };
    
    // Reset window if expired
    if (now - domainData.windowStart > windowMs) {
      domainData.count = 0;
      domainData.windowStart = now;
    }
    
    // Calculate delay based on request frequency
    let delay = this.defaultDelay;
    
    if (domainData.count >= this.requestsPerMinute) {
      // Exceeded rate limit, use max delay
      delay = this.maxDelay;
    } else if (domainData.count > this.requestsPerMinute / 2) {
      // Approaching limit, increase delay
      delay = this.minDelay + (this.maxDelay - this.minDelay) * 
        (domainData.count / this.requestsPerMinute);
    }
    
    // Update domain data
    domainData.count++;
    this.domainRequestCounts.set(domain, domainData);
    
    return this._addJitter(delay);
  }

  /**
   * Wait before making a request
   */
  async wait(url = null) {
    const domain = url ? this._getDomain(url) : 'global';
    const delay = this._calculateDelay(domain);
    
    logger.debug('Rate limit wait', {
      domain,
      delay: Math.round(delay),
      requestCount: this.domainRequestCounts.get(domain)?.count || 0
    });
    
    if (delay > 0) {
      await sleep(delay);
    }
    
    return { domain, delay };
  }

  /**
   * Wait with custom delay
   */
  async waitCustom(ms) {
    const delay = this._addJitter(ms);
    logger.debug('Custom wait', { delay: Math.round(delay) });
    await sleep(delay);
    return { delay };
  }

  /**
   * Reset rate limit for a domain
   */
  reset(domain = null) {
    if (domain) {
      this.domainRequestCounts.delete(domain);
      this.domainTimers.delete(domain);
      logger.debug('Reset rate limit for domain', { domain });
    } else {
      this.domainRequestCounts.clear();
      this.domainTimers.clear();
      this.globalRequestCount = 0;
      this.globalTimers = [];
      logger.debug('Reset all rate limits');
    }
  }

  /**
   * Get current rate limit status
   */
  getStatus(domain = null) {
    if (domain) {
      const data = this.domainRequestCounts.get(domain) || { count: 0, windowStart: Date.now() };
      return {
        domain,
        requestCount: data.count,
        limit: this.requestsPerMinute,
        remaining: Math.max(0, this.requestsPerMinute - data.count),
        windowStart: data.windowStart
      };
    }
    
    // Return global status
    const totalRequests = Array.from(this.domainRequestCounts.values())
      .reduce((sum, d) => sum + d.count, 0);
    
    return {
      domain: 'global',
      totalRequests,
      domainsTracked: this.domainRequestCounts.size
    };
  }

  /**
   * Set custom rate limit for a domain
   */
  setDomainLimit(domain, requestsPerMinute) {
    logger.debug('Set domain rate limit', { domain, requestsPerMinute });
    // Store in domain-specific config if needed
  }
}

export default RateLimiter;
