/**
 * Paginator
 * Handles pagination detection and navigation
 */

class Paginator {
  constructor() {
    this.currentPage = 1;
    this.maxPages = Infinity;
    this.strategy = 'auto';
  }

  /**
   * Paginate through pages
   */
  async paginate(options = {}) {
    const {
      strategy = 'auto',
      selector = null,
      maxPages = Infinity,
      delay = 1000
    } = options;

    this.maxPages = maxPages;
    this.strategy = strategy;

    const results = [];
    let hasNextPage = true;
    let pageCount = 0;

    while (hasNextPage && pageCount < this.maxPages) {
      pageCount++;
      
      // Signal page loaded
      results.push({
        page: pageCount,
        url: window.location.href,
        timestamp: Date.now()
      });

      // Check if we should continue
      hasNextPage = await this.hasNextPage(selector);

      if (hasNextPage && pageCount < this.maxPages) {
        await this.nextPage(selector);
        
        // Wait for page load
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return {
      success: true,
      pagesVisited: pageCount,
      results
    };
  }

  /**
   * Check if there's a next page
   */
  async hasNextPage(selector) {
    if (selector) {
      const element = document.querySelector(selector);
      return element && !element.classList.contains('disabled');
    }

    // Auto-detect strategies
    const strategies = [
      () => this._checkNextLink(),
      () => this._checkPaginationElement(),
      () => this._checkLoadMore(),
      () => this._checkInfiniteScroll()
    ];

    for (const check of strategies) {
      const result = check();
      if (result !== null) {
        return result;
      }
    }

    return false;
  }

  /**
   * Navigate to next page
   */
  async nextPage(selector) {
    if (selector) {
      const element = document.querySelector(selector);
      if (element) {
        return this._clickElement(element);
      }
    }

    // Try different strategies
    const strategies = [
      () => this._clickNextLink(),
      () => this._clickPaginationButton(),
      () => this._clickLoadMore(),
      () => this._scrollForInfinite()
    ];

    for (const action of strategies) {
      const result = await action();
      if (result) {
        this.currentPage++;
        return true;
      }
    }

    return false;
  }

  /**
   * Check for next link (rel="next")
   */
  _checkNextLink() {
    const nextLink = document.querySelector('a[rel="next"]');
    return nextLink ? !!nextLink.href : null;
  }

  /**
   * Check pagination element
   */
  _checkPaginationElement() {
    const paginationSelectors = [
      '.pagination .next:not(.disabled)',
      '.pager .next:not(.disabled)',
      '[class*="pagination"] li.next:not(.disabled)',
      '.paging .active + li:not(.disabled)'
    ];

    for (const selector of paginationSelectors) {
      const element = document.querySelector(selector);
      if (element) return true;
    }

    return null;
  }

  /**
   * Check for load more button
   */
  _checkLoadMore() {
    const loadMoreSelectors = [
      '[class*="load-more"]',
      '[class*="show-more"]',
      '[class*="view-more"]',
      'button[class*="more"]'
    ];

    for (const selector of loadMoreSelectors) {
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null) {
        return true;
      }
    }

    return null;
  }

  /**
   * Check for infinite scroll
   */
  _checkInfiniteScroll() {
    // Detect infinite scroll by checking if scrolling triggers content load
    const scrollHeight = document.documentElement.scrollHeight;
    return scrollHeight > window.innerHeight;
  }

  /**
   * Click next link
   */
  async _clickNextLink() {
    const nextLink = document.querySelector('a[rel="next"], a.next');
    if (nextLink) {
      return this._clickElement(nextLink);
    }
    return false;
  }

  /**
   * Click pagination button
   */
  async _clickPaginationButton() {
    const buttons = [
      '.pagination .next',
      '.pager .next',
      '[class*="pagination"] li.next',
      '.paging .active + li'
    ];

    for (const selector of buttons) {
      const element = document.querySelector(selector);
      if (element && !element.classList.contains('disabled')) {
        return this._clickElement(element);
      }
    }

    return false;
  }

  /**
   * Click load more button
   */
  async _clickLoadMore() {
    const selectors = [
      '[class*="load-more"]',
      '[class*="show-more"]',
      '[class*="view-more"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null) {
        return this._clickElement(element);
      }
    }

    return false;
  }

  /**
   * Scroll for infinite scroll pages
   */
  async _scrollForInfinite() {
    const scrollHeight = document.documentElement.scrollHeight;
    
    window.scrollTo(0, scrollHeight);
    
    // Wait for potential content load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if new content was loaded
    const newScrollHeight = document.documentElement.scrollHeight;
    return newScrollHeight > scrollHeight;
  }

  /**
   * Click element with human-like behavior
   */
  async _clickElement(element) {
    if (!element) return false;

    // Scroll into view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Human-like delay
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
    
    // Click
    element.click();
    
    return true;
  }

  /**
   * Go to specific page number
   */
  async goToPage(pageNumber, selector = '.pagination') {
    const pagination = document.querySelector(selector);
    if (!pagination) return false;

    const pageLink = pagination.querySelector(`a[href*="page=${pageNumber}"], li:nth-child(${pageNumber}) a`);
    
    if (pageLink) {
      await this._clickElement(pageLink);
      this.currentPage = pageNumber;
      return true;
    }

    return false;
  }

  /**
   * Get current page number
   */
  getCurrentPage() {
    // Try to detect from URL
    const urlParams = new URLSearchParams(window.location.search);
    const pageParam = urlParams.get('page') || urlParams.get('p');
    
    if (pageParam) {
      return parseInt(pageParam) || 1;
    }

    // Try to detect from pagination element
    const activePage = document.querySelector('.pagination .active, [aria-current="page"]');
    if (activePage) {
      return parseInt(activePage.textContent) || 1;
    }

    return this.currentPage;
  }

  /**
   * Reset state
   */
  reset() {
    this.currentPage = 1;
    this.maxPages = Infinity;
    this.strategy = 'auto';
  }
}

export default Paginator;
