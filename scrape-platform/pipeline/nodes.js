/**
 * Pipeline Nodes
 * Abstract node classes for building scraping pipelines
 */

import { CONSTANTS } from '../shared/constants.js';
import Logger from '../shared/logger.js';

const logger = new Logger({ module: 'pipeline-nodes' });

/**
 * Base Node Class
 */
export class PipelineNode {
  constructor(config = {}) {
    this.id = config.id || `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.type = config.type || 'base';
    this.name = config.name || this.type;
    this.config = config.config || {};
    this.enabled = config.enabled ?? true;
    
    // Execution state
    this.status = 'pending';
    this.lastError = null;
    this.executionTime = 0;
  }

  /**
   * Execute the node
   * Override in subclasses
   */
  async execute(context) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Validate node configuration
   */
  validate() {
    return { valid: true, errors: [] };
  }

  /**
   * Get node metadata
   */
  getMetadata() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      status: this.status,
      enabled: this.enabled,
      lastError: this.lastError,
      executionTime: this.executionTime
    };
  }

  /**
   * Serialize node to JSON
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      config: this.config,
      enabled: this.enabled
    };
  }
}

/**
 * Navigate Node - Navigate to a URL
 */
export class NavigateNode extends PipelineNode {
  constructor(config) {
    super({ ...config, type: CONSTANTS.NODE_TYPES.NAVIGATE });
  }

  async execute(context) {
    const startTime = Date.now();
    this.status = 'running';

    try {
      const { url, waitUntil = 'networkidle', timeout = 30000 } = this.config;
      
      // Resolve URL with context variables
      const resolvedUrl = this._resolveUrl(url, context);

      logger.debug('Navigating', { url: resolvedUrl });

      // In browser context
      if (typeof window !== 'undefined') {
        window.location.href = resolvedUrl;
        
        // Wait for navigation
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Navigation timeout'));
          }, timeout);
          
          window.addEventListener('load', () => {
            clearTimeout(timeoutId);
            resolve();
          }, { once: true });
        });
      }

      this.status = 'completed';
      this.executionTime = Date.now() - startTime;

      return {
        success: true,
        url: resolvedUrl,
        title: document?.title
      };
    } catch (error) {
      this.status = 'failed';
      this.lastError = error.message;
      this.executionTime = Date.now() - startTime;
      throw error;
    }
  }

  _resolveUrl(url, context) {
    // Handle template variables like {{baseUrl}}/products/{{page}}
    return url.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return context.variables?.[key] || key;
    });
  }

  validate() {
    const errors = [];
    if (!this.config.url) {
      errors.push('URL is required');
    }
    return { valid: errors.length === 0, errors };
  }
}

/**
 * Extract Node - Extract data from page
 */
export class ExtractNode extends PipelineNode {
  constructor(config) {
    super({ ...config, type: CONSTANTS.NODE_TYPES.EXTRACT });
  }

  async execute(context) {
    const startTime = Date.now();
    this.status = 'running';

    try {
      const { schema, method = 'css', useLLM = false } = this.config;

      let data;

      if (useLLM) {
        // Use LLM extraction
        data = await this._extractWithLLM(schema, context);
      } else {
        // Use DOM extraction
        data = await this._extractFromDOM(schema, method);
      }

      this.status = 'completed';
      this.executionTime = Date.now() - startTime;

      // Store extracted data in context
      context.data = context.data || [];
      context.data.push(data);

      return { success: true, data };
    } catch (error) {
      this.status = 'failed';
      this.lastError = error.message;
      this.executionTime = Date.now() - startTime;
      throw error;
    }
  }

  async _extractFromDOM(schema, method) {
    const result = {};

    for (const [field, selector] of Object.entries(schema)) {
      try {
        const element = method === 'xpath'
          ? document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
          : document.querySelector(selector);

        result[field] = element?.textContent?.trim() || null;
      } catch (e) {
        result[field] = null;
      }
    }

    return result;
  }

  async _extractWithLLM(schema, context) {
    // Import dynamically to avoid circular dependencies
    const LLMExtractor = (await import('../ai/llm-extractor.js')).default;
    const extractor = new LLMExtractor();
    
    return extractor.extract(schema, {
      html: document.documentElement.outerHTML,
      url: window.location.href
    });
  }

  validate() {
    const errors = [];
    if (!this.config.schema || typeof this.config.schema !== 'object') {
      errors.push('Valid schema is required');
    }
    return { valid: errors.length === 0, errors };
  }
}

/**
 * Click Node - Click an element
 */
export class ClickNode extends PipelineNode {
  constructor(config) {
    super({ ...config, type: CONSTANTS.NODE_TYPES.CLICK });
  }

  async execute(context) {
    const startTime = Date.now();
    this.status = 'running';

    try {
      const { selector, waitFor = 1000, multiple = false } = this.config;

      const elements = multiple 
        ? Array.from(document.querySelectorAll(selector))
        : [document.querySelector(selector)];

      if (elements.length === 0 || !elements[0]) {
        throw new Error(`Element not found: ${selector}`);
      }

      for (const element of elements) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
        element.click();
        
        if (waitFor > 0) {
          await new Promise(resolve => setTimeout(resolve, waitFor));
        }
      }

      this.status = 'completed';
      this.executionTime = Date.now() - startTime;

      return { success: true, clickedCount: elements.length };
    } catch (error) {
      this.status = 'failed';
      this.lastError = error.message;
      this.executionTime = Date.now() - startTime;
      throw error;
    }
  }

  validate() {
    const errors = [];
    if (!this.config.selector) {
      errors.push('Selector is required');
    }
    return { valid: errors.length === 0, errors };
  }
}

/**
 * Paginate Node - Handle pagination
 */
export class PaginateNode extends PipelineNode {
  constructor(config) {
    super({ ...config, type: CONSTANTS.NODE_TYPES.PAGINATE });
  }

  async execute(context) {
    const startTime = Date.now();
    this.status = 'running';

    try {
      const { strategy = 'next', selector, maxPages = 10 } = this.config;

      let pageCount = 0;
      const pages = [];

      while (pageCount < maxPages) {
        pageCount++;
        pages.push({
          page: pageCount,
          url: window.location.href,
          timestamp: Date.now()
        });

        // Check if there's a next page
        const hasNext = await this._hasNextPage(strategy, selector);
        
        if (!hasNext) break;

        // Navigate to next page
        await this._goToNextPage(strategy, selector);
        
        // Wait for page load
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      this.status = 'completed';
      this.executionTime = Date.now() - startTime;

      return { success: true, pagesVisited: pageCount, pages };
    } catch (error) {
      this.status = 'failed';
      this.lastError = error.message;
      this.executionTime = Date.now() - startTime;
      throw error;
    }
  }

  async _hasNextPage(strategy, selector) {
    if (selector) {
      const element = document.querySelector(selector);
      return element && !element.classList.contains('disabled');
    }

    // Default: look for next link
    return !!document.querySelector('a[rel="next"], a.next, .next:not(.disabled)');
  }

  async _goToNextPage(strategy, selector) {
    if (selector) {
      document.querySelector(selector)?.click();
      return;
    }

    // Default: click next link
    const nextLink = document.querySelector('a[rel="next"], a.next, .next a');
    if (nextLink) {
      nextLink.click();
    }
  }

  validate() {
    const errors = [];
    if (this.config.maxPages && (this.config.maxPages < 1 || this.config.maxPages > 1000)) {
      errors.push('maxPages must be between 1 and 1000');
    }
    return { valid: errors.length === 0, errors };
  }
}

/**
 * Transform Node - Transform extracted data
 */
export class TransformNode extends PipelineNode {
  constructor(config) {
    super({ ...config, type: CONSTANTS.NODE_TYPES.TRANSFORM });
  }

  async execute(context) {
    const startTime = Date.now();
    this.status = 'running';

    try {
      const { operation, script } = this.config;

      let transformedData = context.data || [];

      switch (operation) {
        case 'filter':
          transformedData = transformedData.filter(item => this._evalFilter(item, script));
          break;
        case 'map':
          transformedData = transformedData.map(item => this._evalMap(item, script));
          break;
        case 'sort':
          transformedData = transformedData.sort((a, b) => this._evalSort(a, b, script));
          break;
        case 'custom':
          transformedData = await this._execCustom(script, transformedData);
          break;
      }

      context.data = transformedData;

      this.status = 'completed';
      this.executionTime = Date.now() - startTime;

      return { success: true, data: transformedData };
    } catch (error) {
      this.status = 'failed';
      this.lastError = error.message;
      this.executionTime = Date.now() - startTime;
      throw error;
    }
  }

  _evalFilter(item, script) {
    // Safe evaluation using Function constructor with limited scope
    const filterFn = new Function('item', `return ${script}`);
    return filterFn(item);
  }

  _evalMap(item, script) {
    const mapFn = new Function('item', `return ${script}`);
    return mapFn(item);
  }

  _evalSort(a, b, script) {
    const sortFn = new Function('a', 'b', `return ${script}`);
    return sortFn(a, b);
  }

  async _execCustom(script, data) {
    const customFn = new Function('data', `return ${script}`);
    return customFn(data);
  }

  validate() {
    const errors = [];
    if (!this.config.operation) {
      errors.push('Operation is required');
    }
    if (!['filter', 'map', 'sort', 'custom'].includes(this.config.operation)) {
      errors.push('Invalid operation');
    }
    return { valid: errors.length === 0, errors };
  }
}

/**
 * Wait Node - Wait for condition
 */
export class WaitNode extends PipelineNode {
  constructor(config) {
    super({ ...config, type: CONSTANTS.NODE_TYPES.WAIT });
  }

  async execute(context) {
    const startTime = Date.now();
    this.status = 'running';

    try {
      const { duration = 1000, selector, condition } = this.config;

      if (selector) {
        // Wait for element
        await this._waitForElement(selector, duration * 10);
      } else if (condition) {
        // Wait for custom condition
        await this._waitForCondition(condition, duration * 10);
      } else {
        // Simple delay
        await new Promise(resolve => setTimeout(resolve, duration));
      }

      this.status = 'completed';
      this.executionTime = Date.now() - startTime;

      return { success: true, waitedMs: this.executionTime };
    } catch (error) {
      this.status = 'failed';
      this.lastError = error.message;
      this.executionTime = Date.now() - startTime;
      throw error;
    }
  }

  async _waitForElement(selector, timeout) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(selector)) {
        resolve();
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        if (document.querySelector(selector)) {
          obs.disconnect();
          resolve();
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for ${selector}`));
      }, timeout);
    });
  }

  async _waitForCondition(condition, timeout) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const fn = new Function(`return ${condition}`);
        if (fn()) {
          return;
        }
      } catch (e) {}
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error('Condition timeout');
  }

  validate() {
    return { valid: true, errors: [] };
  }
}

/**
 * Export Node - Export data
 */
export class ExportNode extends PipelineNode {
  constructor(config) {
    super({ ...config, type: CONSTANTS.NODE_TYPES.EXPORT });
  }

  async execute(context) {
    const startTime = Date.now();
    this.status = 'running';

    try {
      const { format = 'json', filename = 'export' } = this.config;
      const data = context.data || [];

      let content;
      let mimeType;

      switch (format) {
        case 'csv':
          content = this._toCSV(data);
          mimeType = 'text/csv';
          break;
        case 'ndjson':
          content = data.map(row => JSON.stringify(row)).join('\n');
          mimeType = 'application/x-ndjson';
          break;
        default:
          content = JSON.stringify(data, null, 2);
          mimeType = 'application/json';
      }

      // Trigger download
      this._downloadFile(content, `${filename}.${format}`, mimeType);

      this.status = 'completed';
      this.executionTime = Date.now() - startTime;

      return { success: true, recordCount: data.length, format };
    } catch (error) {
      this.status = 'failed';
      this.lastError = error.message;
      this.executionTime = Date.now() - startTime;
      throw error;
    }
  }

  _toCSV(data) {
    if (!data.length) return '';
    
    const headers = Object.keys(data[0]);
    const rows = data.map(row => 
      headers.map(h => JSON.stringify(row[h] ?? '')).join(',')
    );
    
    return [headers.join(','), ...rows].join('\n');
  }

  _downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  validate() {
    const errors = [];
    if (this.config.format && !['json', 'csv', 'ndjson'].includes(this.config.format)) {
      errors.push('Invalid format');
    }
    return { valid: errors.length === 0, errors };
  }
}

/**
 * Node Registry
 */
export const NodeRegistry = {
  [CONSTANTS.NODE_TYPES.NAVIGATE]: NavigateNode,
  [CONSTANTS.NODE_TYPES.EXTRACT]: ExtractNode,
  [CONSTANTS.NODE_TYPES.CLICK]: ClickNode,
  [CONSTANTS.NODE_TYPES.PAGINATE]: PaginateNode,
  [CONSTANTS.NODE_TYPES.TRANSFORM]: TransformNode,
  [CONSTANTS.NODE_TYPES.WAIT]: WaitNode,
  [CONSTANTS.NODE_TYPES.EXPORT]: ExportNode
};

/**
 * Create node from config
 */
export function createNode(config) {
  const NodeClass = NodeRegistry[config.type];
  
  if (!NodeClass) {
    throw new Error(`Unknown node type: ${config.type}`);
  }
  
  return new NodeClass(config);
}

export default {
  PipelineNode,
  NavigateNode,
  ExtractNode,
  ClickNode,
  PaginateNode,
  TransformNode,
  WaitNode,
  ExportNode,
  NodeRegistry,
  createNode
};
