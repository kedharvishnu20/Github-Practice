/**
 * Background Controller
 * Central orchestration engine for the scraping platform
 */

import { CONSTANTS } from '../shared/constants.js';
import Logger from '../shared/logger.js';
import RateLimiter from './rate-limiter.js';
import ProxyManager from './proxy-manager.js';
import { apiKeyManager } from './api-key-manager.js';
import { jobScheduler } from './job-scheduler.js';

const logger = new Logger({ module: 'controller' });

class BackgroundController {
  constructor() {
    this.rateLimiter = new RateLimiter();
    this.proxyManager = new ProxyManager();
    this.apiKeyManager = apiKeyManager;
    this.jobScheduler = jobScheduler;
    
    // Tab to job mapping
    this.tabJobs = new Map();
    
    // Message handlers
    this._setupMessageHandlers();
    
    // Tab event listeners
    this._setupTabListeners();
    
    logger.info('Background controller initialized');
  }

  /**
   * Set up message handlers for communication with content scripts and UI
   */
  _setupMessageHandlers() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this._handleMessage(message, sender, sendResponse);
        return true; // Keep channel open for async response
      });
    }
  }

  /**
   * Handle incoming messages
   */
  async _handleMessage(message, sender, sendResponse) {
    const { type, payload } = message;
    
    logger.debug('Message received', { 
      type, 
      source: sender.tab ? `tab:${sender.tab.id}` : 'extension' 
    });

    try {
      let response;

      switch (type) {
        case CONSTANTS.MESSAGE_TYPES.START_JOB:
          response = await this._startJob(payload, sender);
          break;
          
        case CONSTANTS.MESSAGE_TYPES.STOP_JOB:
          response = await this._stopJob(payload);
          break;
          
        case CONSTANTS.MESSAGE_TYPES.PAUSE_JOB:
          response = await this._pauseJob(payload);
          break;
          
        case CONSTANTS.MESSAGE_TYPES.RESUME_JOB:
          response = await this._resumeJob(payload);
          break;
          
        case CONSTANTS.MESSAGE_TYPES.GET_STATUS:
          response = await this._getStatus(payload);
          break;
          
        case CONSTANTS.MESSAGE_TYPES.EXTRACT_DATA:
          response = await this._extractData(payload, sender);
          break;
          
        case CONSTANTS.MESSAGE_TYPES.ANALYZE_PAGE:
          response = await this._analyzePage(payload, sender);
          break;
          
        case CONSTANTS.MESSAGE_TYPES.RUN_PIPELINE:
          response = await this._runPipeline(payload, sender);
          break;
          
        case CONSTANTS.MESSAGE_TYPES.LOG_MESSAGE:
          response = await this._logMessage(payload);
          break;
          
        default:
          logger.warn('Unknown message type', { type });
          response = { success: false, error: 'Unknown message type' };
      }

      sendResponse({ success: true, ...response });
    } catch (error) {
      logger.error('Message handling failed', { type, error: error.message });
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Start a new scraping job
   */
  async _startJob(payload, sender) {
    const { config } = payload;
    
    const jobId = await this.jobScheduler.createJob(config);
    
    // Track tab association
    if (sender.tab?.id) {
      this.tabJobs.set(sender.tab.id, jobId);
    }
    
    logger.info('Job started', { jobId, url: config.url });
    
    return { jobId };
  }

  /**
   * Stop a running job
   */
  async _stopJob(payload) {
    const { jobId } = payload;
    const result = await this.jobScheduler.cancelJob(jobId);
    
    logger.info('Job stopped', { jobId, result });
    
    return { result };
  }

  /**
   * Pause a job
   */
  async _pauseJob(payload) {
    const { jobId } = payload;
    const result = await this.jobScheduler.pauseJob(jobId);
    
    logger.info('Job paused', { jobId, result });
    
    return { result };
  }

  /**
   * Resume a paused job
   */
  async _resumeJob(payload) {
    const { jobId } = payload;
    const result = await this.jobScheduler.resumeJob(jobId);
    
    logger.info('Job resumed', { jobId, result });
    
    return { result };
  }

  /**
   * Get job or system status
   */
  async _getStatus(payload) {
    const { jobId } = payload;
    
    if (jobId) {
      const job = this.jobScheduler.getJob(jobId);
      return { job };
    }
    
    return {
      scheduler: this.jobScheduler.getStatus(),
      rateLimiter: this.rateLimiter.getStatus(),
      proxyManager: this.proxyManager.getStatus()
    };
  }

  /**
   * Extract data from page (delegates to content script)
   */
  async _extractData(payload, sender) {
    const { selectors, options } = payload;
    const tabId = sender.tab?.id;
    
    if (!tabId) {
      throw new Error('No tab context available');
    }
    
    // Apply rate limiting
    await this.rateLimiter.wait(sender.url);
    
    // Execute extraction in content script
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'EXTRACT',
      payload: { selectors, options }
    });
    
    return { data: response?.data };
  }

  /**
   * Analyze page structure
   */
  async _analyzePage(payload, sender) {
    const tabId = sender.tab?.id;
    
    if (!tabId) {
      throw new Error('No tab context available');
    }
    
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'ANALYZE',
      payload
    });
    
    return { analysis: response?.analysis };
  }

  /**
   * Run a pipeline
   */
  async _runPipeline(payload, sender) {
    const { pipeline } = payload;
    
    // Create job for pipeline
    const jobId = await this.jobScheduler.createJob({
      type: 'pipeline',
      pipeline,
      url: pipeline.steps?.[0]?.url || ''
    });
    
    logger.info('Pipeline job created', { jobId, pipelineName: pipeline.name });
    
    return { jobId };
  }

  /**
   * Log a message from content script
   */
  async _logMessage(payload) {
    const { level, message, context } = payload;
    
    if (logger[level]) {
      logger[level](message, context);
    }
    
    return { logged: true };
  }

  /**
   * Set up tab event listeners
   */
  _setupTabListeners() {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      // Clean up tab-job mapping when tab is closed
      chrome.tabs.onRemoved.addListener((tabId) => {
        const jobId = this.tabJobs.get(tabId);
        if (jobId) {
          this.tabJobs.delete(tabId);
          logger.debug('Tab closed, cleaned up job mapping', { tabId, jobId });
        }
      });
    }
  }

  /**
   * Execute script in tab
   */
  async executeScript(tabId, func, args = []) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func,
        args
      });
      
      return results[0]?.result;
    } catch (error) {
      logger.error('Script execution failed', { tabId, error: error.message });
      throw error;
    }
  }

  /**
   * Inject content script into tab
   */
  async injectContentScript(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/content-script.js']
      });
      
      logger.debug('Content script injected', { tabId });
      return true;
    } catch (error) {
      logger.error('Content script injection failed', { tabId, error: error.message });
      return false;
    }
  }

  /**
   * Open side panel for tab
   */
  async openSidePanel(tabId) {
    if (typeof chrome !== 'undefined' && chrome.sidePanel) {
      await chrome.sidePanel.open({ tabId });
    }
  }

  /**
   * Get current tab URL
   */
  async getCurrentTabUrl() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url;
  }

  /**
   * Configure proxies
   */
  configureProxies(proxies, options = {}) {
    this.proxyManager = new ProxyManager({ proxies, ...options });
    logger.info('Proxies configured', { count: proxies.length });
  }

  /**
   * Configure rate limiting
   */
  configureRateLimit(options) {
    this.rateLimiter = new RateLimiter(options);
    logger.info('Rate limit configured', options);
  }
}

// Export singleton instance
export const controller = new BackgroundController();
export default BackgroundController;
