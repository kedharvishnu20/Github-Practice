/**
 * Page Analyzer
 * Detects page types and structures for intelligent extraction
 */

class PageAnalyzer {
  constructor() {
    this.pageTypes = {
      UNKNOWN: 'unknown',
      ARTICLE: 'article',
      PRODUCT: 'product',
      LISTING: 'listing',
      SEARCH_RESULTS: 'search_results',
      PAGINATED_LIST: 'paginated_list',
      FORM: 'form',
      TABLE: 'table',
      PROFILE: 'profile'
    };
  }

  /**
   * Perform full page analysis
   */
  async fullAnalysis() {
    return {
      url: window.location.href,
      title: document.title,
      pageType: this.detectPageType(),
      structure: this.analyzeStructure(),
      content: this.analyzeContent(),
      navigation: this.analyzeNavigation(),
      forms: this.analyzeForms(),
      tables: this.analyzeTables(),
      lists: this.analyzeLists(),
      pagination: this.detectPagination(),
      metadata: this.extractMetadata(),
      suggestions: this.generateSuggestions()
    };
  }

  /**
   * Analyze with options
   */
  async analyze(options = {}) {
    const { deep = false } = options;
    
    const analysis = {
      pageType: this.detectPageType(),
      timestamp: Date.now()
    };

    if (deep) {
      return this.fullAnalysis();
    }

    return analysis;
  }

  /**
   * Detect page type based on content patterns
   */
  detectPageType() {
    const url = window.location.href.toLowerCase();
    const html = document.documentElement.innerHTML.toLowerCase();
    const text = document.body.textContent.toLowerCase();

    // Check URL patterns first
    if (url.includes('/product/') || url.includes('/item/')) {
      return this.pageTypes.PRODUCT;
    }
    if (url.includes('/search') || url.includes('?q=') || url.includes('&q=')) {
      return this.pageTypes.SEARCH_RESULTS;
    }
    if (url.includes('/blog/') || url.includes('/article/') || url.includes('/news/')) {
      return this.pageTypes.ARTICLE;
    }

    // Check DOM structure
    const hasProductSchema = this._hasStructuredData('Product');
    const hasArticleSchema = this._hasStructuredData('Article');
    const hasItemListSchema = this._hasStructuredData('ItemList');

    if (hasProductSchema) return this.pageTypes.PRODUCT;
    if (hasArticleSchema) return this.pageTypes.ARTICLE;
    if (hasItemListSchema) return this.pageTypes.LISTING;

    // Heuristic detection
    const productIndicators = this._countSelectors([
      '[class*="product"]',
      '[class*="price"]',
      '[class*="add-to-cart"]',
      '[itemprop="price"]'
    ]);

    const articleIndicators = this._countSelectors([
      'article',
      '[class*="article"]',
      '[class*="post-content"]',
      '.entry-content'
    ]);

    const listingIndicators = this._countSelectors([
      '[class*="product-list"]',
      '[class*="item-grid"]',
      '.results',
      '[class*="search-result"]'
    ]);

    if (productIndicators >= 3) return this.pageTypes.PRODUCT;
    if (articleIndicators >= 2) return this.pageTypes.ARTICLE;
    if (listingIndicators >= 3) return this.pageTypes.LISTING;

    // Check for tables
    if (document.querySelectorAll('table').length > 1) {
      return this.pageTypes.TABLE;
    }

    // Check for forms
    if (document.querySelectorAll('form').length > 0) {
      return this.pageTypes.FORM;
    }

    return this.pageTypes.UNKNOWN;
  }

  /**
   * Analyze page structure
   */
  analyzeStructure() {
    return {
      doctype: document.doctype?.name || 'unknown',
      language: document.documentElement.lang || 'en',
      hasViewport: !!document.querySelector('meta[name="viewport"]'),
      isResponsive: window.innerWidth <= 768 || 
                    !!document.querySelector('meta[name="viewport"]'),
      totalElements: document.getElementsByTagName('*').length,
      totalImages: document.images.length,
      totalLinks: document.links.length,
      totalForms: document.forms.length,
      totalTables: document.querySelectorAll('table').length,
      domDepth: this._getDomDepth(document.body),
      mainContainers: this._findMainContainers()
    };
  }

  /**
   * Analyze content areas
   */
  analyzeContent() {
    const mainContent = document.querySelector('main') || 
                       document.querySelector('[role="main"]') ||
                       document.querySelector('#content') ||
                       document.querySelector('.content');

    return {
      hasMainContent: !!mainContent,
      mainContentSelector: mainContent ? this._getElementSelector(mainContent) : null,
      wordCount: document.body.textContent.trim().split(/\s+/).length,
      headings: this._extractHeadings(),
      paragraphs: document.querySelectorAll('p').length,
      images: {
        total: document.images.length,
        withAlt: Array.from(document.images).filter(img => img.alt).length,
        lazyLoaded: Array.from(document.images).filter(img => img.loading === 'lazy').length
      }
    };
  }

  /**
   * Analyze navigation elements
   */
  analyzeNavigation() {
    const navElements = document.querySelectorAll('nav');
    const breadcrumbs = document.querySelector('[class*="breadcrumb"]') || 
                       document.querySelector('[aria-label="Breadcrumb"]');

    return {
      hasNav: navElements.length > 0,
      navCount: navElements.length,
      hasBreadcrumbs: !!breadcrumbs,
      breadcrumbsSelector: breadcrumbs ? this._getElementSelector(breadcrumbs) : null,
      pagination: this.detectPagination(),
      internalLinks: this._countInternalLinks(),
      externalLinks: this._countExternalLinks()
    };
  }

  /**
   * Analyze forms on page
   */
  analyzeForms() {
    const forms = Array.from(document.forms);
    
    return {
      count: forms.length,
      forms: forms.map((form, index) => ({
        index,
        id: form.id || null,
        name: form.name || null,
        action: form.action || null,
        method: form.method?.toUpperCase() || 'GET',
        fields: Array.from(form.elements).map(el => ({
          tag: el.tagName.toLowerCase(),
          type: el.type || null,
          name: el.name || null,
          id: el.id || null,
          required: el.required || false,
          placeholder: el.placeholder || null
        }))
      }))
    };
  }

  /**
   * Analyze tables on page
   */
  analyzeTables() {
    const tables = Array.from(document.querySelectorAll('table'));
    
    return {
      count: tables.length,
      tables: tables.map((table, index) => ({
        index,
        id: table.id || null,
        rows: table.querySelectorAll('tr').length,
        columns: this._getTableColumns(table),
        hasHeader: !!table.querySelector('thead'),
        hasFooter: !!table.querySelector('tfoot'),
        selector: this._getElementSelector(table)
      }))
    };
  }

  /**
   * Analyze lists on page
   */
  analyzeLists() {
    const lists = Array.from(document.querySelectorAll('ul, ol'));
    
    return {
      count: lists.length,
      repeatableItems: this._detectRepeatableItems()
    };
  }

  /**
   * Detect pagination elements
   */
  detectPagination() {
    const paginationSelectors = [
      '[class*="pagination"]',
      '[class*="pager"]',
      '.paging',
      '[aria-label*="page"]',
      'nav[aria-label*="page"]'
    ];

    for (const selector of paginationSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        return {
          detected: true,
          selector: this._getElementSelector(element),
          hasNext: this._hasNextPage(element),
          currentPage: this._getCurrentPage(element)
        };
      }
    }

    // Check for next/prev links
    const nextLink = document.querySelector('a[rel="next"], a.next, .next a');
    const prevLink = document.querySelector('a[rel="prev"], a.prev, .prev a');

    if (nextLink || prevLink) {
      return {
        detected: true,
        nextSelector: nextLink ? this._getElementSelector(nextLink) : null,
        prevSelector: prevLink ? this._getElementSelector(prevLink) : null,
        hasNext: !!nextLink
      };
    }

    return { detected: false };
  }

  /**
   * Extract page metadata
   */
  extractMetadata() {
    return {
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content || null,
      keywords: document.querySelector('meta[name="keywords"]')?.content || null,
      author: document.querySelector('meta[name="author"]')?.content || null,
      ogTitle: document.querySelector('meta[property="og:title"]')?.content || null,
      ogDescription: document.querySelector('meta[property="og:description"]')?.content || null,
      ogImage: document.querySelector('meta[property="og:image"]')?.content || null,
      canonical: document.querySelector('link[rel="canonical"]')?.href || null,
      structuredData: this._extractStructuredData()
    };
  }

  /**
   * Generate extraction suggestions
   */
  generateSuggestions() {
    const pageType = this.detectPageType();
    const suggestions = [];

    switch (pageType) {
      case this.pageTypes.PRODUCT:
        suggestions.push({
          type: 'product_extraction',
          fields: ['name', 'price', 'description', 'images', 'reviews', 'availability'],
          confidence: 'high'
        });
        break;
      case this.pageTypes.ARTICLE:
        suggestions.push({
          type: 'article_extraction',
          fields: ['title', 'author', 'date', 'content', 'tags'],
          confidence: 'high'
        });
        break;
      case this.pageTypes.LISTING:
        suggestions.push({
          type: 'list_extraction',
          strategy: 'repeatable_items',
          confidence: 'medium'
        });
        break;
    }

    const pagination = this.detectPagination();
    if (pagination.detected && pagination.hasNext) {
      suggestions.push({
        type: 'pagination',
        strategy: 'click_next',
        selector: pagination.nextSelector || pagination.selector,
        confidence: 'medium'
      });
    }

    return suggestions;
  }

  // Helper methods

  _hasStructuredData(type) {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data['@type'] === type || 
            (Array.isArray(data) && data.some(item => item['@type'] === type))) {
          return true;
        }
      } catch (e) {}
    }
    return false;
  }

  _extractStructuredData() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const data = [];
    
    for (const script of scripts) {
      try {
        data.push(JSON.parse(script.textContent));
      } catch (e) {}
    }
    
    return data;
  }

  _countSelectors(selectors) {
    return selectors.reduce((count, selector) => {
      return count + document.querySelectorAll(selector).length;
    }, 0);
  }

  _getDomDepth(element, depth = 0) {
    let maxDepth = depth;
    for (const child of element.children) {
      const childDepth = this._getDomDepth(child, depth + 1);
      maxDepth = Math.max(maxDepth, childDepth);
    }
    return maxDepth;
  }

  _findMainContainers() {
    const containers = [];
    const mainSelectors = ['main', '#main', '.main', '#content', '.content', '[role="main"]'];
    
    for (const selector of mainSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        containers.push(this._getElementSelector(el));
      }
    }
    
    return containers;
  }

  _extractHeadings() {
    const headings = [];
    for (let i = 1; i <= 6; i++) {
      const tags = document.querySelectorAll(`h${i}`);
      tags.forEach(tag => {
        headings.push({ level: i, text: tag.textContent.trim() });
      });
    }
    return headings;
  }

  _getTableColumns(table) {
    const rows = table.querySelectorAll('tr');
    if (rows.length === 0) return 0;
    
    const firstRow = rows[0];
    return firstRow.querySelectorAll('td, th').length;
  }

  _detectRepeatableItems() {
    // Look for repeated patterns in lists
    const lists = document.querySelectorAll('ul, ol');
    const repeatablePatterns = [];

    lists.forEach(list => {
      const items = list.querySelectorAll(':scope > li');
      if (items.length >= 3) {
        // Check if items have similar structure
        const firstItemStructure = this._getElementStructure(items[0]);
        const similarCount = Array.from(items).slice(1).filter(item => {
          return this._getElementStructure(item) === firstItemStructure;
        }).length;

        if (similarCount / items.length > 0.7) {
          repeatablePatterns.push({
            container: this._getElementSelector(list),
            itemSelector: ':scope > li',
            itemCount: items.length,
            similarity: similarCount / items.length
          });
        }
      }
    });

    return repeatablePatterns;
  }

  _getElementStructure(element) {
    if (!element) return '';
    return Array.from(element.children)
      .map(child => child.tagName.toLowerCase())
      .sort()
      .join(',');
  }

  _getElementSelector(element) {
    if (element.id) return `#${element.id}`;
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c).join('.');
      if (classes) return `${element.tagName.toLowerCase()}.${classes}`;
    }
    return element.tagName.toLowerCase();
  }

  _hasNextPage(paginationElement) {
    return !!(
      paginationElement.querySelector('a.next') ||
      paginationElement.querySelector('[rel="next"]') ||
      paginationElement.querySelector('.next:not(.disabled)')
    );
  }

  _getCurrentPage(paginationElement) {
    const active = paginationElement.querySelector('.active, [aria-current="page"]');
    if (active) {
      return parseInt(active.textContent) || 1;
    }
    return 1;
  }

  _countInternalLinks() {
    const currentHost = window.location.hostname;
    return Array.from(document.links).filter(link => {
      try {
        return new URL(link.href).hostname === currentHost;
      } catch {
        return false;
      }
    }).length;
  }

  _countExternalLinks() {
    const currentHost = window.location.hostname;
    return Array.from(document.links).filter(link => {
      try {
        return new URL(link.href).hostname !== currentHost;
      } catch {
        return false;
      }
    }).length;
  }
}

export default PageAnalyzer;
