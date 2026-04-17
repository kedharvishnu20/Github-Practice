/**
 * Structured DOM Parser (XML-like Format)
 * Converts HTML DOM to structured XML-like format for easier scraping
 * 
 * Benefits:
 * - Consistent tree structure regardless of HTML validity
 * - XPath queries work reliably
 * - Easier serialization and transmission
 * - Better for LLM processing
 */

class StructuredDOMParser {
  constructor(options = {}) {
    this.options = {
      includeText: options.includeText ?? true,
      includeAttributes: options.attributes ?? true,
      includeComments: options.comments ?? false,
      maxDepth: options.maxDepth ?? 50,
      pruneEmpty: options.pruneEmpty ?? false,
      attributeFilter: options.attributeFilter || null, // Array of allowed attributes
      tagFilter: options.tagFilter || null, // Array of allowed tags
      ...options
    };
    
    this.cache = new Map();
    this.stats = {
      parsed: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  /**
   * Parse entire document or element to structured XML-like format
   */
  parse(root = document, options = {}) {
    const cacheKey = this._generateCacheKey(root, options);
    
    if (this.cache.has(cacheKey)) {
      this.stats.cacheHits++;
      return this.cache.get(cacheKey);
    }
    
    this.stats.cacheMisses++;
    
    const mergedOptions = { ...this.options, ...options };
    const result = this._parseNode(root, 0, mergedOptions);
    
    this.cache.set(cacheKey, result);
    this.stats.parsed++;
    
    // Limit cache size
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    return result;
  }

  /**
   * Parse a single node recursively
   */
  _parseNode(node, depth, options) {
    // Depth limit
    if (depth > options.maxDepth) {
      return null;
    }

    // Skip non-element nodes based on options
    if (!options.includeComments && node.nodeType === Node.COMMENT_NODE) {
      return null;
    }

    // Text nodes
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (!text || (options.pruneEmpty && !text)) {
        return null;
      }
      return {
        type: 'text',
        content: text
      };
    }

    // CDATA sections
    if (node.nodeType === Node.CDATA_SECTION_NODE) {
      return {
        type: 'cdata',
        content: node.data
      };
    }

    // Element nodes
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();
      
      // Tag filter
      if (options.tagFilter && !options.tagFilter.includes(tagName)) {
        return null;
      }

      const elementNode = {
        type: 'element',
        tag: tagName,
        attributes: {},
        children: []
      };

      // Extract attributes
      if (options.includeAttributes && node.attributes) {
        for (const attr of node.attributes) {
          // Attribute filter
          if (options.attributeFilter && !options.attributeFilter.includes(attr.name)) {
            continue;
          }
          
          // Skip empty attributes
          if (attr.value === '' && options.pruneEmpty) {
            continue;
          }
          
          elementNode.attributes[attr.name] = attr.value;
        }
      }

      // Add id as special attribute if present
      if (node.id) {
        elementNode.id = node.id;
      }

      // Add classes as special array if present
      if (node.className) {
        elementNode.classes = node.className.split(/\s+/).filter(c => c);
      }

      // Process children
      for (const child of node.childNodes) {
        const childResult = this._parseNode(child, depth + 1, options);
        if (childResult !== null) {
          elementNode.children.push(childResult);
        }
      }

      // Prune empty elements
      if (options.pruneEmpty && elementNode.children.length === 0) {
        const hasText = elementNode.attributes['textContent']?.trim();
        if (!hasText) {
          return null;
        }
      }

      return elementNode;
    }

    // Other node types
    return {
      type: 'unknown',
      nodeType: node.nodeType
    };
  }

  /**
   * Generate cache key for a node
   */
  _generateCacheKey(node, options) {
    const baseKey = node === document ? 'document' : 
                   node.id ? `id:${node.id}` :
                   node.className ? `class:${node.className}` :
                   node.tagName ? `tag:${node.tagName}` : 'unknown';
    
    const optionsKey = JSON.stringify(options);
    return `${baseKey}:${this._hash(optionsKey)}`;
  }

  /**
   * Simple hash function for strings
   */
  _hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Convert structured format back to HTML string
   */
  toHTML(structuredNode, indent = 0) {
    if (!structuredNode) return '';
    
    if (structuredNode.type === 'text') {
      return this._escapeHtml(structuredNode.content);
    }
    
    if (structuredNode.type === 'cdata') {
      return `<![CDATA[${structuredNode.content}]]>`;
    }
    
    if (structuredNode.type === 'element') {
      const { tag, attributes, children } = structuredNode;
      
      // Build opening tag
      let html = `<${tag}`;
      
      if (attributes) {
        for (const [key, value] of Object.entries(attributes)) {
          html += ` ${key}="${this._escapeHtml(value)}"`;
        }
      }
      
      // Self-closing tags
      const selfClosing = ['img', 'br', 'hr', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr'];
      if (selfClosing.includes(tag) && (!children || children.length === 0)) {
        return html + ' />';
      }
      
      html += '>';
      
      // Add children
      if (children && children.length > 0) {
        for (const child of children) {
          html += this.toHTML(child, indent + 2);
        }
      }
      
      html += `</${tag}>`;
      return html;
    }
    
    return '';
  }

  /**
   * Convert structured format to XML string
   */
  toXML(structuredNode, indent = 0) {
    if (!structuredNode) return '';
    
    const spaces = ' '.repeat(indent);
    
    if (structuredNode.type === 'text') {
      return spaces + this._escapeXml(structuredNode.content);
    }
    
    if (structuredNode.type === 'cdata') {
      return spaces + `<![CDATA[${structuredNode.content}]]>`;
    }
    
    if (structuredNode.type === 'element') {
      const { tag, attributes, children } = structuredNode;
      
      // Build opening tag
      let xml = `${spaces}<${tag}`;
      
      if (attributes) {
        for (const [key, value] of Object.entries(attributes)) {
          xml += ` ${key}="${this._escapeXml(value)}"`;
        }
      }
      
      // Self-closing if no children
      if (!children || children.length === 0) {
        return xml + '/>';
      }
      
      xml += '>\n';
      
      // Add children
      for (const child of children) {
        xml += this.toXML(child, indent + 2) + '\n';
      }
      
      xml += `${spaces}</${tag}>`;
      return xml;
    }
    
    return '';
  }

  /**
   * Convert structured format to JSON (already is, but normalized)
   */
  toJSON(structuredNode) {
    return JSON.parse(JSON.stringify(structuredNode));
  }

  /**
   * Query structured DOM using path notation
   * Supports: tag, #id, .class, [attr], [attr=value]
   */
  query(structuredNode, selector) {
    const results = [];
    this._queryRecursive(structuredNode, this._parseSelector(selector), results);
    return results;
  }

  /**
   * Parse CSS-like selector into components
   */
  _parseSelector(selector) {
    const parts = [];
    const regex = /([#.])?([\w-]+)|\[(\w+)(?:=([^\]]+))?\]/g;
    let match;
    
    while ((match = regex.exec(selector)) !== null) {
      if (match[1] === '#') {
        parts.push({ type: 'id', value: match[2] });
      } else if (match[1] === '.') {
        parts.push({ type: 'class', value: match[2] });
      } else if (match[3]) {
        parts.push({ 
          type: 'attribute', 
          name: match[3], 
          value: match[4]?.replace(/["']/g, '') 
        });
      } else {
        parts.push({ type: 'tag', value: match[2] });
      }
    }
    
    return parts;
  }

  /**
   * Recursive query implementation
   */
  _queryRecursive(node, selectorParts, results) {
    if (!node || node.type !== 'element') return;
    
    if (this._matchesSelector(node, selectorParts)) {
      results.push(node);
    }
    
    if (node.children) {
      for (const child of node.children) {
        this._queryRecursive(child, selectorParts, results);
      }
    }
  }

  /**
   * Check if node matches selector parts
   */
  _matchesSelector(node, selectorParts) {
    for (const part of selectorParts) {
      switch (part.type) {
        case 'tag':
          if (node.tag !== part.value) return false;
          break;
        case 'id':
          if (node.id !== part.value) return false;
          break;
        case 'class':
          if (!node.classes || !node.classes.includes(part.value)) return false;
          break;
        case 'attribute':
          if (!node.attributes) return false;
          if (part.value !== undefined) {
            if (node.attributes[part.name] !== part.value) return false;
          } else {
            if (!(part.name in node.attributes)) return false;
          }
          break;
      }
    }
    return true;
  }

  /**
   * Extract text content from structured node
   */
  extractText(structuredNode, joinChar = ' ') {
    if (!structuredNode) return '';
    
    if (structuredNode.type === 'text') {
      return structuredNode.content;
    }
    
    if (structuredNode.type === 'element' && structuredNode.children) {
      const texts = [];
      for (const child of structuredNode.children) {
        const text = this.extractText(child, joinChar);
        if (text) {
          texts.push(text);
        }
      }
      return texts.join(joinChar);
    }
    
    return '';
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.stats.cacheHits = 0;
    this.stats.cacheMisses = 0;
  }

  /**
   * Escape HTML special characters
   */
  _escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Escape XML special characters
   */
  _escapeXml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Batch parse multiple elements
   */
  batchParse(elements, options = {}) {
    return elements.map(el => this.parse(el, options));
  }

  /**
   * Parse with performance metrics
   */
  parseWithMetrics(root, options = {}) {
    const startTime = performance.now();
    const result = this.parse(root, options);
    const endTime = performance.now();
    
    return {
      data: result,
      metrics: {
        parseTimeMs: endTime - startTime,
        nodeCount: this._countNodes(result),
        maxDepth: this._getMaxDepth(result)
      }
    };
  }

  /**
   * Count nodes in structured data
   */
  _countNodes(node) {
    if (!node) return 0;
    if (node.type !== 'element' || !node.children) return 1;
    
    let count = 1;
    for (const child of node.children) {
      count += this._countNodes(child);
    }
    return count;
  }

  /**
   * Get maximum depth of structured data
   */
  _getMaxDepth(node, currentDepth = 0) {
    if (!node) return currentDepth;
    if (node.type !== 'element' || !node.children || node.children.length === 0) {
      return currentDepth + 1;
    }
    
    let maxChildDepth = currentDepth + 1;
    for (const child of node.children) {
      const childDepth = this._getMaxDepth(child, currentDepth + 1);
      maxChildDepth = Math.max(maxChildDepth, childDepth);
    }
    return maxChildDepth;
  }
}

export default StructuredDOMParser;
