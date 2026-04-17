/**
 * Structured JSON Logger
 * Provides consistent logging across the platform with job tracking
 */

import { CONSTANTS } from './constants.js';

class Logger {
  constructor(options = {}) {
    this.jobId = options.jobId || null;
    this.stepId = options.stepId || null;
    this.module = options.module || 'unknown';
    this.logLevel = options.logLevel || 'info';
    this.storageKey = options.storageKey || 'scrape_logs';
    
    // Log levels hierarchy
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
  }

  /**
   * Set context for logging (jobId, stepId, etc.)
   */
  setContext(context) {
    if (context.jobId) this.jobId = context.jobId;
    if (context.stepId) this.stepId = context.stepId;
    if (context.module) this.module = context.module;
    return this;
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext) {
    return new Logger({
      jobId: this.jobId || additionalContext.jobId,
      stepId: this.stepId || additionalContext.stepId,
      module: additionalContext.module || this.module,
      logLevel: this.logLevel
    });
  }

  /**
   * Build log entry with metadata
   */
  _buildLogEntry(level, message, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      module: this.module,
      message,
      jobId: this.jobId,
      stepId: this.stepId,
      ...data
    };

    // Remove undefined values
    return Object.fromEntries(
      Object.entries(entry).filter(([_, v]) => v !== undefined)
    );
  }

  /**
   * Output log entry
   */
  _output(entry) {
    // Check log level
    if (this.levels[level] < this.levels[this.logLevel]) {
      return;
    }

    const logLine = JSON.stringify(entry);
    
    // In background script / Node.js
    if (typeof console !== 'undefined') {
      switch (entry.level) {
        case 'debug':
          console.debug(logLine);
          break;
        case 'info':
          console.info(logLine);
          break;
        case 'warn':
          console.warn(logLine);
          break;
        case 'error':
          console.error(logLine);
          break;
      }
    }

    // Store in Chrome storage if available
    if (typeof chrome !== 'undefined' && chrome.storage) {
      this._storeLog(entry);
    }
  }

  /**
   * Store log in Chrome storage (with rotation)
   */
  async _storeLog(entry) {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const logs = result[this.storageKey] || [];
      
      logs.push(entry);
      
      // Rotate logs if too many
      if (logs.length > 1000) {
        logs.splice(0, logs.length - 1000);
      }
      
      await chrome.storage.local.set({ [this.storageKey]: logs });
    } catch (e) {
      // Silently fail if storage is unavailable
    }
  }

  /**
   * Debug level log
   */
  debug(message, data = {}) {
    const entry = this._buildLogEntry('debug', message, data);
    this._output(entry);
  }

  /**
   * Info level log
   */
  info(message, data = {}) {
    const entry = this._buildLogEntry('info', message, data);
    this._output(entry);
  }

  /**
   * Warning level log
   */
  warn(message, data = {}) {
    const entry = this._buildLogEntry('warn', message, data);
    this._output(entry);
  }

  /**
   * Error level log
   */
  error(message, data = {}) {
    const entry = this._buildLogEntry('error', message, data);
    this._output(entry);
  }

  /**
   * Log job start
   */
  logJobStart(jobConfig) {
    this.info('Job started', {
      jobType: 'start',
      config: jobConfig
    });
  }

  /**
   * Log job completion
   */
  logJobComplete(stats) {
    this.info('Job completed', {
      jobType: 'complete',
      stats
    });
  }

  /**
   * Log job error
   */
  logJobError(error, context = {}) {
    this.error('Job failed', {
      jobType: 'error',
      error: error.message,
      stack: error.stack,
      ...context
    });
  }

  /**
   * Log step execution
   */
  logStep(stepName, status, data = {}) {
    this.info(`Step: ${stepName}`, {
      jobType: 'step',
      stepName,
      status,
      ...data
    });
  }

  /**
   * Get stored logs
   */
  async getLogs(limit = 100) {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const logs = result[this.storageKey] || [];
      return logs.slice(-limit);
    } catch (e) {
      return [];
    }
  }

  /**
   * Clear stored logs
   */
  async clearLogs() {
    try {
      await chrome.storage.local.remove([this.storageKey]);
    } catch (e) {
      // Silently fail
    }
  }
}

// Export singleton instance and class
export const logger = new Logger({ module: 'main' });
export default Logger;
