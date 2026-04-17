/**
 * Content Script
 * Injected into web pages for data extraction and interaction
 */

import { CONSTANTS } from '../shared/constants.js';
import SmartExtractor from './extractor.js';
import PageAnalyzer from './page-analyzer.js';
import Paginator from './paginator.js';
import FormFiller from './form-filler.js';
import CaptchaDetector from './captcha-detector.js';

class ContentScript {
  constructor() {
    this.extractor = new SmartExtractor();
    this.analyzer = new PageAnalyzer();
    this.paginator = new Paginator();
    this.formFiller = new FormFiller();
    this.captchaDetector = new CaptchaDetector();
    
    this.isInitialized = false;
    this.currentJob = null;
    
    this._init();
  }

  /**
   * Initialize content script
   */
  _init() {
    if (this.isInitialized) return;
    
    console.log('[ScrapePlatform] Content script initialized');
    
    // Set up message listener
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this._handleMessage(message, sender, sendResponse);
      return true; // Keep channel open for async response
    });

    // Mark page as having content script
    window.scrapePlatformActive = true;
    
    this.isInitialized = true;
  }

  /**
   * Handle messages from background script
   */
  async _handleMessage(message, sender, sendResponse) {
    const { type, payload } = message;

    try {
      let response;

      switch (type) {
        case 'EXTRACT':
          response = await this._handleExtract(payload);
          break;

        case 'ANALYZE':
          response = await this._handleAnalyze(payload);
          break;

        case 'ANALYZE_PAGE':
          response = await this._handleAnalyzePage();
          break;

        case 'PAGINATE':
          response = await this._handlePaginate(payload);
          break;

        case 'FILL_FORM':
          response = await this._handleFillForm(payload);
          break;

        case 'CLICK_ELEMENT':
          response = await this._handleClickElement(payload);
          break;

        case 'DETECT_CAPTCHA':
          response = await this._handleDetectCaptcha();
          break;

        case 'START_SCRAPING':
          response = await this._handleStartScraping(payload);
          break;

        case 'STOP_SCRAPING':
          response = await this._handleStopScraping();
          break;

        default:
          response = { error: 'Unknown message type' };
      }

      sendResponse(response);
    } catch (error) {
      console.error('[ScrapePlatform] Message handling error:', error);
      sendResponse({ error: error.message });
    }
  }

  /**
   * Handle data extraction
   */
  async _handleExtract(payload) {
    const { selectors, options = {} } = payload;
    
    const data = await this.extractor.extract(selectors, options);
    
    return {
      success: true,
      data,
      timestamp: Date.now(),
      url: window.location.href
    };
  }

  /**
   * Handle page analysis request
   */
  async _handleAnalyze(payload) {
    const analysis = await this.analyzer.analyze(payload?.options);
    
    return {
      success: true,
      analysis,
      url: window.location.href
    };
  }

  /**
   * Handle full page analysis
   */
  async _handleAnalyzePage() {
    const analysis = await this.analyzer.fullAnalysis();
    
    // Notify side panel
    chrome.runtime.sendMessage({
      type: 'PAGE_ANALYZED',
      payload: { analysis, url: window.location.href }
    }).catch(() => {});
    
    return { success: true, analysis };
  }

  /**
   * Handle pagination
   */
  async _handlePaginate(payload) {
    const { strategy, selector } = payload;
    
    const result = await this.paginator.paginate({ strategy, selector });
    
    return {
      success: result.success,
      hasNextPage: result.hasNextPage,
      currentPage: result.currentPage
    };
  }

  /**
   * Handle form filling
   */
  async _handleFillForm(payload) {
    const { fields, submit = false } = payload;
    
    const result = await this.formFiller.fill(fields, submit);
    
    return {
      success: result.success,
      filledCount: result.filledCount
    };
  }

  /**
   * Handle element click
   */
  async _handleClickElement(payload) {
    const { selector, waitFor = 0 } = payload;
    
    const element = document.querySelector(selector);
    
    if (!element) {
      return { success: false, error: 'Element not found' };
    }

    // Human-like delay
    if (waitFor > 0) {
      await new Promise(resolve => setTimeout(resolve, waitFor));
    }

    // Scroll into view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Click with delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    element.click();

    return { success: true };
  }

  /**
   * Handle CAPTCHA detection
   */
  async _handleDetectCaptcha() {
    const captchaDetected = await this.captchaDetector.detect();
    
    return {
      success: true,
      captchaDetected,
      type: captchaDetected ? this.captchaDetector.getCaptchaType() : null
    };
  }

  /**
   * Handle start scraping
   */
  async _handleStartScraping(payload) {
    this.currentJob = payload?.jobId || null;
    
    console.log('[ScrapePlatform] Scraping started', { jobId: this.currentJob });
    
    return { success: true, jobId: this.currentJob };
  }

  /**
   * Handle stop scraping
   */
  async _handleStopScraping() {
    this.currentJob = null;
    
    console.log('[ScrapePlatform] Scraping stopped');
    
    return { success: true };
  }

  /**
   * Get page metadata
   */
  getPageMetadata() {
    return {
      url: window.location.href,
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content || '',
      canonical: document.querySelector('link[rel="canonical"]')?.href || '',
      timestamp: Date.now()
    };
  }

  /**
   * Check if element is visible
   */
  isElementVisible(element) {
    if (!element) return false;
    
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  /**
   * Wait for element
   */
  async waitForElement(selector, timeout = 10000) {
    if (document.querySelector(selector)) {
      return document.querySelector(selector);
    }

    return new Promise((resolve, reject) => {
      const observer = new MutationObserver((mutations, obs) => {
        const element = document.querySelector(selector);
        if (element) {
          obs.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for ${selector}`));
      }, timeout);
    });
  }

  /**
   * Simulate human-like scrolling
   */
  async humanScroll(element, duration = 1000) {
    const start = window.scrollY;
    const target = element ? element.offsetTop : document.body.scrollHeight;
    const distance = target - start;
    const startTime = Date.now();

    return new Promise(resolve => {
      const scroll = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function for natural movement
        const easeOut = 1 - Math.pow(1 - progress, 3);
        
        window.scrollTo(0, start + distance * easeOut);

        if (progress < 1) {
          requestAnimationFrame(scroll);
        } else {
          resolve();
        }
      };

      scroll();
    });
  }
}

// Initialize content script
const contentScript = new ContentScript();

// Export for potential external use
window.ScrapePlatform = {
  extract: (selectors, options) => contentScript.extractor.extract(selectors, options),
  analyze: () => contentScript.analyzer.fullAnalysis(),
  getPageMetadata: () => contentScript.getPageMetadata()
};

console.log('[ScrapePlatform] Content script loaded on', window.location.href);
