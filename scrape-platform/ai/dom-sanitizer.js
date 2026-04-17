/**
 * DOM Sanitizer
 * Prepares HTML for LLM processing by removing unnecessary content
 */

export class DOMSanitizer {
  constructor(options = {}) {
    this.maxDepth = options.maxDepth || 10;
    this.removeScripts = options.removeScripts ?? true;
    this.removeStyles = options.removeStyles ?? true;
    this.removeComments = options.removeComments ?? true;
    this.preserveTags = options.preserveTags || ['script', 'style', 'noscript'];
  }

  /**
   * Sanitize HTML string
   */
  sanitize(html) {
    if (typeof html !== 'string') {
      throw new Error('HTML must be a string');
    }

    let sanitized = html;

    // Remove comments
    if (this.removeComments) {
      sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, '');
    }

    // Remove script tags and content
    if (this.removeScripts) {
      sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    }

    // Remove style tags and content
    if (this.removeStyles) {
      sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    }

    // Remove inline styles
    sanitized = sanitized.replace(/\s*style\s*=\s*["'][^"']*["']/gi, '');

    // Remove event handlers
    sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');

    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ');

    return sanitized.trim();
  }

  /**
   * Extract text content from HTML
   */
  extractText(html, options = {}) {
    const { 
      preserveStructure = false,
      maxLength = 10000
    } = options;

    // Create temporary element
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Remove hidden elements
    const hiddenSelectors = [
      'script', 'style', 'noscript', 'meta', 'link',
      '[hidden]', '[aria-hidden="true"]', '.hidden'
    ];
    
    hiddenSelectors.forEach(selector => {
      temp.querySelectorAll(selector).forEach(el => el.remove());
    });

    if (preserveStructure) {
      // Keep some structure with line breaks
      temp.querySelectorAll('p, br, hr').forEach(el => {
        el.appendChild(document.createTextNode('\n'));
      });
      return temp.textContent.substring(0, maxLength);
    }

    return temp.textContent.replace(/\s+/g, ' ').trim().substring(0, maxLength);
  }

  /**
   * Get simplified HTML representation
   */
  simplify(html, options = {}) {
    const {
      maxTags = 500,
      truncateText = 100,
      removeAttributes = true
    } = options;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    let tagCount = 0;
    const walker = document.createTreeWalker(
      doc.body,
      NodeFilter.SHOW_ELEMENT,
      null,
      false
    );

    const nodesToRemove = [];

    while (walker.nextNode() && tagCount < maxTags) {
      const node = walker.currentNode;
      tagCount++;

      if (removeAttributes && node.attributes) {
        // Keep only essential attributes
        const essentialAttrs = ['href', 'src', 'alt', 'title', 'name', 'id', 'class'];
        const attrsToRemove = [];
        
        for (const attr of node.attributes) {
          if (!essentialAttrs.includes(attr.name)) {
            attrsToRemove.push(attr.name);
          }
        }
        
        attrsToRemove.forEach(attr => node.removeAttribute(attr));
      }

      // Truncate text nodes
      if (node.childNodes.length === 1 && node.firstChild.nodeType === Node.TEXT_NODE) {
        const text = node.firstChild.textContent;
        if (text.length > truncateText) {
          node.firstChild.textContent = text.substring(0, truncateText) + '...';
        }
      }
    }

    // Remove excess nodes
    nodesToRemove.forEach(node => node.remove());

    return doc.body.innerHTML;
  }

  /**
   * Convert HTML to markdown-like format for LLM
   */
  toMarkdown(html) {
    let md = html;

    // Headers
    md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
    md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
    md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');

    // Paragraphs
    md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

    // Line breaks
    md = md.replace(/<br\s*\/?>/gi, '\n');

    // Bold
    md = md.replace(/<(?:b|strong)[^>]*>(.*?)<\/(?:b|strong)>/gi, '**$1**');

    // Italic
    md = md.replace(/<(?:i|em)[^>]*>(.*?)<\/(?:i|em)>/gi, '*$1*');

    // Links
    md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

    // Images
    md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)');

    // Lists
    md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
    md = md.replace(/<\/?[uo]l[^>]*>/gi, '\n');

    // Remove remaining tags
    md = md.replace(/<[^>]+>/g, '');

    // Clean up whitespace
    md = md.replace(/\n{3,}/g, '\n\n');

    return md.trim();
  }

  /**
   * Validate HTML structure
   */
  validate(html) {
    const errors = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Check for parsing errors
    const parseErrors = doc.querySelector('parsererror');
    if (parseErrors) {
      errors.push(parseErrors.textContent);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export default DOMSanitizer;
