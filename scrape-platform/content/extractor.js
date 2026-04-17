/**
 * Smart DOM Extractor
 * Extracts structured data using CSS/XPath selectors with heuristics
 */

class SmartExtractor {
  constructor() {
    this.cache = new Map();
    this.defaultTimeout = 5000;
  }

  /**
   * Extract data based on selectors configuration
   */
  async extract(selectors, options = {}) {
    const {
      method = 'css',
      waitForSelector = false,
      timeout = this.defaultTimeout,
      multiple = true,
      transform = null,
      fallback = null
    } = options;

    try {
      let result;

      if (typeof selectors === 'string') {
        // Simple selector string
        result = await this._extractSimple(selectors, method, multiple);
      } else if (Array.isArray(selectors)) {
        // Array of selectors - try each until one works
        result = await this._extractFallback(selectors, method, multiple);
      } else if (typeof selectors === 'object') {
        // Object with named fields
        result = await this._extractObject(selectors, options);
      } else {
        throw new Error('Invalid selectors format');
      }

      // Apply transformation if provided
      if (transform && typeof transform === 'function') {
        result = transform(result);
      }

      // Apply fallback if result is null/empty
      if ((result === null || result === undefined || result === '') && fallback !== undefined) {
        result = fallback;
      }

      return result;
    } catch (error) {
      console.error('[SmartExtractor] Extraction failed:', error);
      return options.fallback || null;
    }
  }

  /**
   * Simple extraction with single selector
   */
  _extractSimple(selector, method, multiple) {
    const element = this._querySelector(selector, method);

    if (!element) {
      return null;
    }

    if (multiple) {
      return this._querySelectorAll(selector, method).map(el => this._getElementValue(el));
    }

    return this._getElementValue(element);
  }

  /**
   * Try multiple selectors until one works (fallback strategy)
   */
  async _extractFallback(selectors, method, multiple) {
    for (const selector of selectors) {
      const result = this._extractSimple(selector, method, multiple);
      if (result !== null && result !== undefined && result !== '') {
        return result;
      }
    }
    return null;
  }

  /**
   * Extract object with multiple named fields
   */
  async _extractObject(schema, globalOptions) {
    const result = {};

    for (const [field, config] of Object.entries(schema)) {
      const fieldConfig = typeof config === 'string' 
        ? { selector: config } 
        : config;

      const {
        selector,
        method = 'css',
        attribute = null,
        multiple = false,
        transform = null,
        fallback = null,
        required = false
      } = fieldConfig;

      let value = null;

      if (selector) {
        value = await this._extractSimple(selector, method, multiple);
      }

      // Apply field-level transformation
      if (transform && typeof transform === 'function' && value !== null) {
        value = transform(value);
      }

      // Handle required fields
      if (required && value === null) {
        console.warn(`[SmartExtractor] Required field "${field}" not found`);
      }

      result[field] = value ?? fallback;
    }

    return result;
  }

  /**
   * Query selector with method support
   */
  _querySelector(selector, method = 'css') {
    if (method === 'xpath') {
      const result = document.evaluate(
        selector,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      return result.singleNodeValue;
    }

    return document.querySelector(selector);
  }

  /**
   * Query selector all with method support
   */
  _querySelectorAll(selector, method = 'css') {
    if (method === 'xpath') {
      const result = document.evaluate(
        selector,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      
      const elements = [];
      for (let i = 0; i < result.snapshotLength; i++) {
        elements.push(result.snapshotItem(i));
      }
      return elements;
    }

    return Array.from(document.querySelectorAll(selector));
  }

  /**
   * Get value from element based on type
   */
  _getElementValue(element) {
    if (!element) return null;

    // Check for specific attributes first
    const tagName = element.tagName.toLowerCase();

    // Input elements
    if (tagName === 'input') {
      const type = element.type?.toLowerCase();
      if (type === 'checkbox' || type === 'radio') {
        return element.checked;
      }
      return element.value;
    }

    // Image
    if (tagName === 'img') {
      return element.src;
    }

    // Link
    if (tagName === 'a') {
      return {
        text: element.textContent.trim(),
        href: element.href
      };
    }

    // Select
    if (tagName === 'select') {
      return element.value;
    }

    // Textarea
    if (tagName === 'textarea') {
      return element.value;
    }

    // Default: get text content
    const text = element.textContent?.trim();
    
    // If has children with text, might be a container
    if (text && text.length > 0) {
      return text;
    }

    // Try to get innerHTML if no text
    return element.innerHTML?.trim() || null;
  }

  /**
   * Wait for element to appear
   */
  async waitForElement(selector, method = 'css', timeout = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const element = this._querySelector(selector, method);
      if (element) {
        return element;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Timeout waiting for element: ${selector}`);
  }

  /**
   * Extract table data
   */
  extractTable(tableSelector, options = {}) {
    const {
      headerSelector = 'th',
      rowSelector = 'tr',
      cellSelector = 'td, th',
      skipHeader = true
    } = options;

    const table = document.querySelector(tableSelector);
    if (!table) return null;

    const rows = this._querySelectorAll(rowSelector, 'css', table);
    const data = [];

    let headers = null;

    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll(cellSelector));
      const rowData = cells.map(cell => cell.textContent.trim());

      if (headers === null && !skipHeader) {
        headers = rowData;
        continue;
      }

      if (headers === null) {
        // First row as header
        headers = rowData;
        continue;
      }

      // Create object with headers
      const rowObj = {};
      headers.forEach((header, index) => {
        rowObj[header] = rowData[index];
      });
      data.push(rowObj);
    }

    return data;
  }

  /**
   * Extract list data
   */
  extractList(listSelector, itemSelector = 'li') {
    const list = document.querySelector(listSelector);
    if (!list) return null;

    const items = list.querySelectorAll(itemSelector);
    return Array.from(items).map(item => item.textContent.trim());
  }

  /**
   * Extract links from page
   */
  extractLinks(options = {}) {
    const {
      selector = 'a[href]',
      includeText = true,
      domain = null,
      external = false
    } = options;

    const links = document.querySelectorAll(selector);
    const currentDomain = window.location.hostname;

    return Array.from(links)
      .map(link => {
        const href = link.href;
        try {
          const url = new URL(href);
          
          // Filter by domain
          if (domain && url.hostname !== domain) return null;
          
          // Filter external/internal
          if (!external && url.hostname !== currentDomain) return null;
          if (external && url.hostname === currentDomain) return null;

          return {
            href,
            text: includeText ? link.textContent.trim() : null,
            hostname: url.hostname
          };
        } catch {
          return null;
        }
      })
      .filter(link => link !== null);
  }

  /**
   * Extract images from page
   */
  extractImages(options = {}) {
    const {
      selector = 'img',
      includeAlt = true,
      minSize = 0
    } = options;

    const images = document.querySelectorAll(selector);

    return Array.from(images)
      .map(img => {
        const rect = img.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

        // Filter by size
        if (width < minSize || height < minSize) return null;

        return {
          src: img.src,
          alt: includeAlt ? img.alt : null,
          width,
          height
        };
      })
      .filter(img => img !== null);
  }

  /**
   * Smart content extraction (article/blog posts)
   */
  extractArticle() {
    // Try common article containers
    const articleSelectors = [
      'article',
      '[role="article"]',
      '.article',
      '.post',
      '.entry',
      '#content',
      '.content'
    ];

    for (const selector of articleSelectors) {
      const article = document.querySelector(selector);
      if (article) {
        return {
          title: article.querySelector('h1')?.textContent.trim() || 
                 document.title,
          content: article.textContent.trim(),
          html: article.innerHTML,
          author: article.querySelector('[rel="author"]')?.textContent.trim() || null,
          date: article.querySelector('time')?.dateTime || 
                article.querySelector('[class*="date"]')?.textContent.trim() || null,
          image: article.querySelector('img')?.src || null
        };
      }
    }

    return null;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

export default SmartExtractor;
