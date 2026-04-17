/**
 * Robots.txt Parser
 * Parses and checks robots.txt rules for compliance
 */

import Logger from '../shared/logger.js';

const logger = new Logger({ module: 'robots-parser' });

export class RobotsParser {
  constructor() {
    this.rules = new Map();
    this.crawlDelay = null;
    this.sitemaps = [];
    this.userAgent = 'ScrapePlatform';
  }

  /**
   * Parse robots.txt content
   */
  parse(content) {
    const lines = content.split('\n');
    let currentUserAgent = null;
    let currentRules = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;

      const [directive, ...valueParts] = trimmed.split(':');
      const directiveLower = directive.trim().toLowerCase();
      const value = valueParts.join(':').trim();

      switch (directiveLower) {
        case 'user-agent':
          // Save previous user-agent rules
          if (currentUserAgent) {
            this._saveRules(currentUserAgent, currentRules);
          }
          currentUserAgent = value;
          currentRules = [];
          break;

        case 'disallow':
          if (value) {
            currentRules.push({ type: 'disallow', path: value });
          }
          break;

        case 'allow':
          currentRules.push({ type: 'allow', path: value });
          break;

        case 'crawl-delay':
          this.crawlDelay = parseInt(value) || null;
          break;

        case 'sitemap':
          this.sitemaps.push(value);
          break;
      }
    }

    // Save last user-agent rules
    if (currentUserAgent) {
      this._saveRules(currentUserAgent, currentRules);
    }

    logger.debug('Robots.txt parsed', {
      userAgentCount: this.rules.size,
      sitemapCount: this.sitemaps.length,
      crawlDelay: this.crawlDelay
    });

    return this;
  }

  /**
   * Save rules for a user-agent
   */
  _saveRules(userAgent, rules) {
    const normalizedUA = userAgent.toLowerCase();
    
    // Handle wildcard
    if (normalizedUA === '*') {
      const existing = this.rules.get('*') || [];
      this.rules.set('*', [...existing, ...rules]);
    } else {
      this.rules.set(normalizedUA, rules);
    }
  }

  /**
   * Check if URL is allowed for scraping
   */
  canScrape(url, userAgent = null) {
    const urlPath = this._getPathFromUrl(url);
    const agentsToCheck = [
      userAgent?.toLowerCase(),
      this.userAgent.toLowerCase(),
      '*'
    ].filter(Boolean);

    for (const agent of agentsToCheck) {
      const rules = this.rules.get(agent);
      if (!rules) continue;

      let allowed = true;
      let longestMatch = -1;

      for (const rule of rules) {
        if (this._pathMatches(urlPath, rule.path)) {
          if (rule.path.length > longestMatch) {
            longestMatch = rule.path.length;
            allowed = rule.type === 'allow';
          }
        }
      }

      if (longestMatch >= 0) {
        return allowed;
      }
    }

    // No matching rules, allow by default
    return true;
  }

  /**
   * Get path from URL
   */
  _getPathFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname + urlObj.search;
    } catch {
      return url;
    }
  }

  /**
   * Check if path matches pattern
   */
  _pathMatches(path, pattern) {
    if (!pattern) return false;
    
    // Convert robots.txt pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\$/g, '$');

    const regex = new RegExp(`^${regexPattern}`);
    return regex.test(path);
  }

  /**
   * Fetch and parse robots.txt from URL
   */
  async fetchFromUrl(baseUrl) {
    try {
      const urlObj = new URL(baseUrl);
      const robotsUrl = `${urlObj.protocol}//${urlObj.hostname}/robots.txt`;

      const response = await fetch(robotsUrl);
      
      if (!response.ok) {
        logger.warn('Failed to fetch robots.txt', { url: robotsUrl });
        return null;
      }

      const content = await response.text();
      return this.parse(content);
    } catch (error) {
      logger.error('Error fetching robots.txt', { error: error.message });
      return null;
    }
  }

  /**
   * Get crawl delay
   */
  getCrawlDelay() {
    return this.crawlDelay;
  }

  /**
   * Get sitemaps
   */
  getSitemaps() {
    return this.sitemaps;
  }

  /**
   * Get all rules
   */
  getRules() {
    return Object.fromEntries(this.rules);
  }

  /**
   * Clear parsed rules
   */
  clear() {
    this.rules.clear();
    this.crawlDelay = null;
    this.sitemaps = [];
  }
}

export default RobotsParser;
