/**
 * PII Detector
 * Detects Personally Identifiable Information in extracted data
 */

import Logger from '../shared/logger.js';

const logger = new Logger({ module: 'pii-detector' });

export class PIIDetector {
  constructor() {
    this.patterns = {
      email: {
        regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        label: 'Email Address',
        severity: 'medium'
      },
      phone: {
        regex: /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?)[-.\s]?\d{3}[-.\s]?\d{4}/g,
        label: 'Phone Number',
        severity: 'high'
      },
      ssn: {
        regex: /\b\d{3}-\d{2}-\d{4}\b/g,
        label: 'Social Security Number',
        severity: 'critical'
      },
      creditCard: {
        regex: /\b(?:\d{4}[- ]?){3}\d{4}\b/g,
        label: 'Credit Card Number',
        severity: 'critical'
      },
      ipAddress: {
        regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
        label: 'IP Address',
        severity: 'medium'
      },
      dateOfBirth: {
        regex: /\b(?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12]\d|3[01])[-/](?:19|20)\d{2}\b/g,
        label: 'Date of Birth',
        severity: 'high'
      },
      address: {
        regex: /\b\d+\s+[A-Za-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl)\b/gi,
        label: 'Street Address',
        severity: 'high'
      },
      zipCode: {
        regex: /\b\d{5}(?:-\d{4})?\b/g,
        label: 'ZIP Code',
        severity: 'low'
      },
      passport: {
        regex: /\b[A-Z]{1,2}\d{6,9}\b/g,
        label: 'Passport Number',
        severity: 'critical'
      },
      driverLicense: {
        regex: /\b[A-Z]\d{7,8}\b/g,
        label: 'Driver License Number',
        severity: 'high'
      }
    };

    this.enabled = true;
    this.action = 'redact'; // 'redact', 'warn', 'skip'
  }

  /**
   * Detect PII in text
   */
  detect(text) {
    if (!this.enabled || !text) {
      return { found: false, items: [] };
    }

    const findings = [];

    for (const [type, config] of Object.entries(this.patterns)) {
      const matches = text.match(config.regex);
      
      if (matches && matches.length > 0) {
        for (const match of matches) {
          findings.push({
            type,
            label: config.label,
            value: match,
            severity: config.severity,
            position: text.indexOf(match)
          });
        }
      }
    }

    return {
      found: findings.length > 0,
      count: findings.length,
      items: findings
    };
  }

  /**
   * Detect PII in object/data structure
   */
  detectInObject(obj, path = '') {
    const results = [];

    if (typeof obj === 'string') {
      const detection = this.detect(obj);
      if (detection.found) {
        results.push({
          path: path || 'root',
          value: obj,
          ...detection
        });
      }
    } else if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        const nestedResults = this.detectInObject(item, `${path}[${index}]`);
        results.push(...nestedResults);
      });
    } else if (obj !== null && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        const nestedResults = this.detectInObject(value, path ? `${path}.${key}` : key);
        results.push(...nestedResults);
      }
    }

    return results;
  }

  /**
   * Redact PII from text
   */
  redact(text, replacement = '[REDACTED]') {
    if (!this.enabled || !text) return text;

    let result = text;

    for (const [type, config] of Object.entries(this.patterns)) {
      result = result.replace(config.regex, replacement);
    }

    return result;
  }

  /**
   * Redact PII from object
   */
  redactInObject(obj, replacement = '[REDACTED]') {
    if (!this.enabled) return obj;

    if (typeof obj === 'string') {
      return this.redact(obj, replacement);
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.redactInObject(item, replacement));
    } else if (obj !== null && typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.redactInObject(value, replacement);
      }
      return result;
    }

    return obj;
  }

  /**
   * Validate data against PII policy
   */
  validate(data, options = {}) {
    const {
      allowedTypes = [],
      blockedTypes = [],
      action = this.action
    } = options;

    const detections = this.detectInObject(data);
    
    if (detections.length === 0) {
      return { valid: true, data };
    }

    // Filter by allowed/blocked types
    const violations = detections.filter(d => {
      if (blockedTypes.includes(d.type)) return true;
      if (allowedTypes.length > 0 && !allowedTypes.includes(d.type)) return false;
      return true;
    });

    if (violations.length === 0) {
      return { valid: true, data };
    }

    // Handle based on action
    switch (action) {
      case 'redact':
        return {
          valid: true,
          data: this.redactInObject(data),
          redacted: violations.length
        };
      
      case 'warn':
        logger.warn('PII detected in data', { 
          count: violations.length,
          types: [...new Set(violations.map(v => v.type))]
        });
        return { valid: true, data, warnings: violations };
      
      case 'skip':
      case 'block':
        return {
          valid: false,
          error: 'PII detected and blocking is enabled',
          violations
        };
      
      default:
        return { valid: true, data };
    }
  }

  /**
   * Get PII statistics
   */
  getStats(data) {
    const detections = this.detectInObject(data);
    const stats = {};

    for (const detection of detections) {
      if (!stats[detection.type]) {
        stats[detection.type] = {
          label: detection.label,
          severity: detection.severity,
          count: 0
        };
      }
      stats[detection.type].count++;
    }

    return {
      total: detections.length,
      byType: stats,
      severityBreakdown: {
        critical: detections.filter(d => d.severity === 'critical').length,
        high: detections.filter(d => d.severity === 'high').length,
        medium: detections.filter(d => d.severity === 'medium').length,
        low: detections.filter(d => d.severity === 'low').length
      }
    };
  }

  /**
   * Enable/disable detection
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Set action for PII handling
   */
  setAction(action) {
    if (['redact', 'warn', 'skip', 'block'].includes(action)) {
      this.action = action;
    }
  }

  /**
   * Add custom pattern
   */
  addPattern(name, regex, label, severity = 'medium') {
    this.patterns[name] = {
      regex: regex instanceof RegExp ? regex : new RegExp(regex, 'g'),
      label,
      severity
    };
  }

  /**
   * Remove pattern
   */
  removePattern(name) {
    delete this.patterns[name];
  }
}

export default PIIDetector;
