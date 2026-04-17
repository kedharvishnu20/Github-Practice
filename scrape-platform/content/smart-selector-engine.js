/**
 * Smart Selector Engine
 * Intelligently selects best extraction method based on page structure
 * Combines CSS, XPath, and structured DOM parsing for optimal results
 */

import StructuredDOMParser from './structured-dom-parser.js';

class SmartSelectorEngine {
  constructor(options = {}) {
    this.options = {
      autoDetect: options.autoDetect ?? true,
      preferStructured: options.preferStructured ?? false,
      cacheEnabled: options.cacheEnabled ?? true,
      fallbackChain: options.fallbackChain ?? ['css', 'xpath', 'structured'],
      ...options
    };
    
    this.parser = new StructuredDOMParser();
    this.structuredCache = new Map();
    this.stats = {
      cssAttempts: 0,
      xpathAttempts: 0,
      structuredAttempts: 0,
      successes: { css: 0, xpath: 0, structured: 0 }
    };
  }

  /**
   * Extract data using smart selector strategy
   */
  async extract(selectors, options = {}) {
    const {
      useStructured = this.options.preferStructured,
      timeout = 5000,
      retries = 2
    } = options;

    // Auto-detect best method if enabled
    const method = this.options.autoDetect 
      ? this._detectBestMethod(selectors)
      : (useStructured ? 'structured' : 'css');

    return this._executeExtraction(selectors, method, options, retries);
  }

  /**
   * Detect best extraction method based on selectors and page
   */
  _detectBestMethod(selectors) {
    // Check if selectors are XPath
    if (typeof selectors === 'string' && selectors.startsWith('//')) {
      return 'xpath';
    }

    // Check if selectors need complex traversal
    if (typeof selectors === 'object') {
      const hasComplexPaths = Object.values(selectors).some(s => 
        typeof s === 'string' && (s.includes(' ') || s.includes('>') || s.includes('+'))
      );
      
      if (hasComplexPaths) {
        return 'structured';
      }
    }

    // Check page complexity
    const elementCount = document.getElementsByTagName('*').length;
    if (elementCount > 1000) {
      return 'css'; // CSS is fastest for large DOMs
    }

    // Default to CSS for simplicity
    return 'css';
  }

  /**
   * Execute extraction with retry logic
   */
  async _executeExtraction(selectors, method, options, retries) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        switch (method) {
          case 'css':
            return await this._extractCSS(selectors, options);
          case 'xpath':
            return await this._extractXPath(selectors, options);
          case 'structured':
            return await this._extractStructured(selectors, options);
          default:
            throw new Error(`Unknown method: ${method}`);
        }
      } catch (error) {
        lastError = error;
        
        // Try next method in fallback chain
        if (attempt < retries && this.options.fallbackChain.length > 0) {
          const currentIndex = this.options.fallbackChain.indexOf(method);
          const nextIndex = (currentIndex + 1) % this.options.fallbackChain.length;
          
          if (nextIndex !== currentIndex) {
            method = this.options.fallbackChain[nextIndex];
            continue;
          }
        }
        
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Extract using CSS selectors
   */
  async _extractCSS(selectors, options) {
    this.stats.cssAttempts++;

    if (typeof selectors === 'string') {
      const element = document.querySelector(selectors);
      if (!element) {
        throw new Error(`CSS selector not found: ${selectors}`);
      }
      this.stats.successes.css++;
      return this._getElementValue(element, options);
    }

    if (Array.isArray(selectors)) {
      const results = [];
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        results.push(Array.from(elements).map(el => this._getElementValue(el, options)));
      }
      this.stats.successes.css++;
      return results;
    }

    if (typeof selectors === 'object') {
      const result = {};
      for (const [key, selector] of Object.entries(selectors)) {
        const element = document.querySelector(selector);
        result[key] = element ? this._getElementValue(element, options) : null;
      }
      this.stats.successes.css++;
      return result;
    }

    throw new Error('Invalid CSS selectors format');
  }

  /**
   * Extract using XPath selectors
   */
  async _extractXPath(selectors, options) {
    this.stats.xpathAttempts++;

    const evaluateXPath = (xpath, multiple = false) => {
      const result = document.evaluate(
        xpath,
        document,
        null,
        multiple ? XPathResult.ORDERED_NODE_SNAPSHOT_TYPE : XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );

      if (multiple) {
        const elements = [];
        for (let i = 0; i < result.snapshotLength; i++) {
          elements.push(result.snapshotItem(i));
        }
        return elements;
      }

      return result.singleNodeValue;
    };

    if (typeof selectors === 'string') {
      const element = evaluateXPath(selectors);
      if (!element) {
        throw new Error(`XPath selector not found: ${selectors}`);
      }
      this.stats.successes.xpath++;
      return this._getElementValue(element, options);
    }

    if (Array.isArray(selectors)) {
      const results = [];
      for (const xpath of selectors) {
        const elements = evaluateXPath(xpath, true);
        results.push(elements.map(el => this._getElementValue(el, options)));
      }
      this.stats.successes.xpath++;
      return results;
    }

    if (typeof selectors === 'object') {
      const result = {};
      for (const [key, xpath] of Object.entries(selectors)) {
        const element = evaluateXPath(xpath);
        result[key] = element ? this._getElementValue(element, options) : null;
      }
      this.stats.successes.xpath++;
      return result;
    }

    throw new Error('Invalid XPath selectors format');
  }

  /**
   * Extract using structured DOM parsing
   */
  async _extractStructured(selectors, options) {
    this.stats.structuredAttempts++;

    // Parse document to structured format
    const structured = this.parser.parse(document, {
      includeText: true,
      includeAttributes: true,
      pruneEmpty: true
    });

    if (typeof selectors === 'string') {
      const results = this.parser.query(structured, selectors);
      if (results.length === 0) {
        throw new Error(`Structured selector not found: ${selectors}`);
      }
      this.stats.successes.structured++;
      return results.map(node => this._processStructuredNode(node, options));
    }

    if (typeof selectors === 'object') {
      const result = {};
      for (const [key, selector] of Object.entries(selectors)) {
        const results = this.parser.query(structured, selector);
        result[key] = results.length > 0 
          ? this._processStructuredNode(results[0], options)
          : null;
      }
      this.stats.successes.structured++;
      return result;
    }

    throw new Error('Invalid structured selectors format');
  }

  /**
   * Get value from DOM element
   */
  _getElementValue(element, options = {}) {
    if (!element) return null;

    const { attribute, textOnly = false } = options;

    // Return specific attribute if requested
    if (attribute) {
      return element.getAttribute(attribute);
    }

    const tagName = element.tagName.toLowerCase();

    // Special handling for different element types
    if (tagName === 'input') {
      const type = element.type?.toLowerCase();
      if (type === 'checkbox' || type === 'radio') {
        return element.checked;
      }
      return element.value;
    }

    if (tagName === 'img') return element.src;
    if (tagName === 'a') {
      return {
        text: element.textContent.trim(),
        href: element.href
      };
    }
    if (tagName === 'select') return element.value;
    if (tagName === 'textarea') return element.value;

    // Default: text content or inner HTML
    const text = element.textContent?.trim();
    if (text || textOnly) {
      return text;
    }

    return element.innerHTML?.trim() || null;
  }

  /**
   * Process structured node to extract value
   */
  _processStructuredNode(node, options = {}) {
    if (!node) return null;

    const { extractField } = options;

    if (node.type === 'text') {
      return node.content;
    }

    if (node.type === 'element') {
      if (extractField) {
        // Extract specific field
        if (extractField === 'text') {
          return this.parser.extractText(node);
        }
        if (extractField === 'attributes') {
          return node.attributes;
        }
        if (extractField === 'classes') {
          return node.classes;
        }
        if (node.attributes && extractField in node.attributes) {
          return node.attributes[extractField];
        }
      }

      // Default: return full node
      return {
        tag: node.tag,
        id: node.id,
        classes: node.classes,
        attributes: node.attributes,
        text: this.parser.extractText(node)
      };
    }

    return null;
  }

  /**
   * Batch extract with parallel processing
   */
  async batchExtract(items, extractor, options = {}) {
    const { concurrency = 5 } = options;
    const results = [];

    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(item => extractor(item).catch(err => ({ error: err.message })))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Wait for element with smart polling
   */
  async waitFor(selector, options = {}) {
    const {
      timeout = 10000,
      interval = 100,
      method = 'auto'
    } = options;

    const startTime = Date.now();
    const detectMethod = method === 'auto' ? this._detectBestMethod(selector) : method;

    while (Date.now() - startTime < timeout) {
      try {
        if (detectMethod === 'xpath') {
          const result = document.evaluate(
            selector,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          );
          if (result.singleNodeValue) {
            return result.singleNodeValue;
          }
        } else {
          const element = document.querySelector(selector);
          if (element) {
            return element;
          }
        }
      } catch (e) {
        // Ignore errors during polling
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`Timeout waiting for: ${selector}`);
  }

  /**
   * Get extraction statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: {
        css: this.stats.cssAttempts > 0 
          ? (this.stats.successes.css / this.stats.cssAttempts * 100).toFixed(2) + '%'
          : '0%',
        xpath: this.stats.xpathAttempts > 0 
          ? (this.stats.successes.xpath / this.stats.xpathAttempts * 100).toFixed(2) + '%'
          : '0%',
        structured: this.stats.structuredAttempts > 0 
          ? (this.stats.successes.structured / this.stats.structuredAttempts * 100).toFixed(2) + '%'
          : '0%'
      }
    };
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.parser.clearCache();
    this.structuredCache.clear();
  }
}

export default SmartSelectorEngine;
