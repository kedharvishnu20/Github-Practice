/**
 * Proxy Manager
 * Manages proxy rotation and validation
 */

import Logger from '../shared/logger.js';

const logger = new Logger({ module: 'proxy-manager' });

class ProxyManager {
  constructor(options = {}) {
    this.proxies = options.proxies || [];
    this.currentIndex = 0;
    this.failedProxies = new Set();
    this.validatedProxies = new Map();
    
    // Rotation strategy
    this.strategy = options.strategy || 'round-robin'; // round-robin, random, sticky
    
    // Sticky session duration
    this.stickySessionDuration = options.stickySessionDuration || 300000; // 5 minutes
    
    // Session tracking for sticky sessions
    this.sessions = new Map();
    
    logger.debug('Proxy manager initialized', {
      proxyCount: this.proxies.length,
      strategy: this.strategy
    });
  }

  /**
   * Add a proxy to the pool
   */
  addProxy(proxy) {
    // Validate proxy format
    if (!this._validateProxyFormat(proxy)) {
      logger.warn('Invalid proxy format', { proxy });
      return false;
    }
    
    this.proxies.push(proxy);
    logger.debug('Proxy added', { 
      host: proxy.host, 
      port: proxy.port,
      type: proxy.type || 'http'
    });
    return true;
  }

  /**
   * Validate proxy format
   */
  _validateProxyFormat(proxy) {
    if (!proxy.host || !proxy.port) return false;
    if (typeof proxy.port !== 'number' || proxy.port < 1 || proxy.port > 65535) return false;
    return true;
  }

  /**
   * Get next proxy based on strategy
   */
  getNextProxy(sessionId = null) {
    if (this.proxies.length === 0) {
      return null;
    }

    // Filter out failed proxies
    const availableProxies = this.proxies.filter(
      p => !this.failedProxies.has(this._getProxyKey(p))
    );

    if (availableProxies.length === 0) {
      logger.warn('No available proxies');
      return null;
    }

    let proxy;

    switch (this.strategy) {
      case 'random':
        proxy = availableProxies[Math.floor(Math.random() * availableProxies.length)];
        break;
      
      case 'sticky':
        if (sessionId && this.sessions.has(sessionId)) {
          const session = this.sessions.get(sessionId);
          // Check if session is still valid
          if (Date.now() - session.timestamp < this.stickySessionDuration) {
            proxy = session.proxy;
          } else {
            this.sessions.delete(sessionId);
          }
        }
        
        if (!proxy) {
          proxy = availableProxies[this.currentIndex % availableProxies.length];
          if (sessionId) {
            this.sessions.set(sessionId, {
              proxy,
              timestamp: Date.now()
            });
          }
        }
        break;
      
      case 'round-robin':
      default:
        proxy = availableProxies[this.currentIndex % availableProxies.length];
        this.currentIndex++;
        break;
    }

    logger.debug('Proxy selected', {
      host: proxy.host,
      port: proxy.port,
      strategy: this.strategy,
      sessionId
    });

    return proxy;
  }

  /**
   * Mark proxy as failed
   */
  markFailed(proxy) {
    const key = this._getProxyKey(proxy);
    this.failedProxies.add(key);
    
    logger.warn('Proxy marked as failed', {
      host: proxy.host,
      port: proxy.port,
      totalFailed: this.failedProxies.size
    });

    // Reset index if current proxy failed
    if (this.proxies[this.currentIndex % this.proxies.length] === proxy) {
      this.currentIndex++;
    }
  }

  /**
   * Mark proxy as successful
   */
  markSuccess(proxy) {
    const key = this._getProxyKey(proxy);
    this.failedProxies.delete(key);
    
    // Update validation timestamp
    this.validatedProxies.set(key, Date.now());
    
    logger.debug('Proxy marked as successful', {
      host: proxy.host,
      port: proxy.port
    });
  }

  /**
   * Reset failed proxies
   */
  resetFailed() {
    const count = this.failedProxies.size;
    this.failedProxies.clear();
    logger.info('Reset failed proxies', { count });
  }

  /**
   * Get proxy key for tracking
   */
  _getProxyKey(proxy) {
    return `${proxy.host}:${proxy.port}`;
  }

  /**
   * Get proxy as URL string
   */
  getProxyUrl(proxy) {
    if (!proxy) return null;
    
    const auth = proxy.username && proxy.password 
      ? `${proxy.username}:${proxy.password}@` 
      : '';
    
    return `${proxy.type || 'http'}://${auth}${proxy.host}:${proxy.port}`;
  }

  /**
   * Get proxy object for Playwright/Node.js
   */
  getProxyObject(proxy) {
    if (!proxy) return null;
    
    return {
      server: this.getProxyUrl(proxy),
      username: proxy.username,
      password: proxy.password
    };
  }

  /**
   * Get all proxies status
   */
  getStatus() {
    return {
      total: this.proxies.length,
      failed: this.failedProxies.size,
      available: this.proxies.length - this.failedProxies.size,
      strategy: this.strategy,
      activeSessions: this.sessions.size
    };
  }

  /**
   * Remove proxy from pool
   */
  removeProxy(proxy) {
    const key = this._getProxyKey(proxy);
    const index = this.proxies.findIndex(p => this._getProxyKey(p) === key);
    
    if (index !== -1) {
      this.proxies.splice(index, 1);
      this.failedProxies.delete(key);
      this.validatedProxies.delete(key);
      
      logger.debug('Proxy removed', { host: proxy.host, port: proxy.port });
      return true;
    }
    
    return false;
  }

  /**
   * Clear all sessions
   */
  clearSessions() {
    this.sessions.clear();
    logger.debug('All sessions cleared');
  }
}

export default ProxyManager;
