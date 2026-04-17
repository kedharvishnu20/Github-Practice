/**
 * API Key Manager
 * Securely manages API keys for LLM and other services
 * Keys are stored in Chrome storage and never exposed to content scripts
 */

import Logger from '../shared/logger.js';

const logger = new Logger({ module: 'api-key-manager' });

class ApiKeyManager {
  constructor() {
    this.storageKey = 'scrape_api_keys';
    this.keyCache = new Map();
    this.usageTracking = new Map();
  }

  /**
   * Store an API key securely
   */
  async setKey(service, key, options = {}) {
    if (!service || !key) {
      throw new Error('Service and key are required');
    }

    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const keys = result[this.storageKey] || {};
      
      keys[service] = {
        key,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...options
      };
      
      await chrome.storage.local.set({ [this.storageKey]: keys });
      
      // Update cache
      this.keyCache.set(service, keys[service]);
      
      logger.info('API key stored', { service, hasOptions: Object.keys(options).length > 0 });
      return true;
    } catch (error) {
      logger.error('Failed to store API key', { service, error: error.message });
      return false;
    }
  }

  /**
   * Get an API key
   */
  async getKey(service) {
    // Check cache first
    if (this.keyCache.has(service)) {
      const cached = this.keyCache.get(service);
      // Check if still valid (not expired)
      if (!cached.expiresAt || cached.expiresAt > Date.now()) {
        this._trackUsage(service);
        return cached.key;
      }
    }

    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const keys = result[this.storageKey] || {};
      
      if (!keys[service]) {
        logger.warn('API key not found', { service });
        return null;
      }

      const keyData = keys[service];
      
      // Check expiration
      if (keyData.expiresAt && keyData.expiresAt <= Date.now()) {
        logger.warn('API key expired', { service });
        return null;
      }

      // Cache the key
      this.keyCache.set(service, keyData);
      this._trackUsage(service);
      
      return keyData.key;
    } catch (error) {
      logger.error('Failed to retrieve API key', { service, error: error.message });
      return null;
    }
  }

  /**
   * Track API key usage
   */
  _trackUsage(service) {
    const usage = this.usageTracking.get(service) || { count: 0, lastUsed: 0 };
    usage.count++;
    usage.lastUsed = Date.now();
    this.usageTracking.set(service, usage);
  }

  /**
   * Delete an API key
   */
  async deleteKey(service) {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const keys = result[this.storageKey] || {};
      
      if (keys[service]) {
        delete keys[service];
        await chrome.storage.local.set({ [this.storageKey]: keys });
        
        // Clear cache
        this.keyCache.delete(service);
        this.usageTracking.delete(service);
        
        logger.info('API key deleted', { service });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Failed to delete API key', { service, error: error.message });
      return false;
    }
  }

  /**
   * List all stored services (not keys)
   */
  async listServices() {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const keys = result[this.storageKey] || {};
      
      return Object.keys(keys).map(service => ({
        service,
        createdAt: keys[service].createdAt,
        updatedAt: keys[service].updatedAt,
        expiresAt: keys[service].expiresAt,
        usageCount: this.usageTracking.get(service)?.count || 0
      }));
    } catch (error) {
      logger.error('Failed to list services', { error: error.message });
      return [];
    }
  }

  /**
   * Check if a service has a valid key
   */
  async hasValidKey(service) {
    const key = await this.getKey(service);
    return key !== null;
  }

  /**
   * Get usage statistics
   */
  getUsageStats() {
    const stats = {};
    
    for (const [service, usage] of this.usageTracking.entries()) {
      stats[service] = {
        ...usage,
        cached: this.keyCache.has(service)
      };
    }
    
    return stats;
  }

  /**
   * Clear all API keys
   */
  async clearAll() {
    try {
      await chrome.storage.local.remove([this.storageKey]);
      this.keyCache.clear();
      this.usageTracking.clear();
      
      logger.info('All API keys cleared');
      return true;
    } catch (error) {
      logger.error('Failed to clear API keys', { error: error.message });
      return false;
    }
  }

  /**
   * Validate key format (basic check)
   */
  validateKeyFormat(service, key) {
    if (!key || typeof key !== 'string') {
      return false;
    }

    // Basic validation based on service
    switch (service.toLowerCase()) {
      case 'openai':
        // OpenAI keys start with 'sk-'
        return key.startsWith('sk-') && key.length >= 20;
      
      case 'anthropic':
        // Anthropic keys start with 'sk-ant-'
        return key.startsWith('sk-ant-') && key.length >= 20;
      
      case 'google':
        // Google AI Studio keys
        return key.length >= 20;
      
      default:
        // Generic validation - just check length
        return key.length >= 8;
    }
  }
}

// Export singleton instance
export const apiKeyManager = new ApiKeyManager();
export default ApiKeyManager;
