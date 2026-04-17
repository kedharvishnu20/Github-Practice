/**
 * LLM-based Extractor
 * Converts messy DOM into structured JSON using LLMs
 * Used as fallback when deterministic extraction fails
 */

import { apiKeyManager } from '../../background/api-key-manager.js';
import Logger from '../../shared/logger.js';
import { DOMSanitizer } from './dom-sanitizer.js';
import { InjectionProtection } from './injection-protection.js';
import { PROMPT_TEMPLATES } from './prompt-templates.js';

const logger = new Logger({ module: 'llm-extractor' });

class LLMExtractor {
  constructor(options = {}) {
    this.provider = options.provider || 'openai';
    this.model = options.model || 'gpt-4o-mini';
    this.maxTokens = options.maxTokens || 4096;
    this.temperature = options.temperature || 0.1;
    this.timeout = options.timeout || 30000;
    
    this.sanitizer = new DOMSanitizer();
    this.injectionProtection = new InjectionProtection();
    
    // Cache for repeated extractions
    this.cache = new Map();
  }

  /**
   * Extract structured data using LLM
   */
  async extract(schema, options = {}) {
    const {
      html = document.documentElement.outerHTML,
      url = window.location.href,
      useCache = true,
      maxRetries = 2
    } = options;

    // Generate cache key
    const cacheKey = this._generateCacheKey(schema, html);
    
    if (useCache && this.cache.has(cacheKey)) {
      logger.debug('Using cached result');
      return this.cache.get(cacheKey);
    }

    // Sanitize HTML
    const sanitizedHtml = this.sanitizer.sanitize(html);
    
    // Check for injection attempts
    if (this.injectionProtection.detectInjection(schema)) {
      logger.warn('Potential prompt injection detected in schema');
      throw new Error('Invalid schema: potential injection attempt');
    }

    // Build prompt
    const prompt = this._buildPrompt(schema, sanitizedHtml, url);

    // Call LLM with retry
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this._callLLM(prompt);
        
        // Parse and validate result
        const parsed = this._parseResult(result, schema);
        
        // Cache successful result
        if (useCache) {
          this.cache.set(cacheKey, parsed);
        }
        
        return parsed;
      } catch (error) {
        lastError = error;
        logger.warn(`Attempt ${attempt} failed`, { error: error.message });
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw lastError;
  }

  /**
   * Build prompt for LLM
   */
  _buildPrompt(schema, html, url) {
    const template = PROMPT_TEMPLATES[this.provider] || PROMPT_TEMPLATES.default;
    
    return template
      .replace('{{SCHEMA}}', JSON.stringify(schema, null, 2))
      .replace('{{HTML}}', this._truncateHtml(html))
      .replace('{{URL}}', url);
  }

  /**
   * Truncate HTML to fit token limits
   */
  _truncateHtml(html, maxLength = 50000) {
    if (html.length <= maxLength) return html;
    
    // Smart truncation - try to keep structure intact
    const truncated = html.substring(0, maxLength);
    const lastTagClose = truncated.lastIndexOf('>');
    
    if (lastTagClose > maxLength - 1000) {
      return truncated.substring(0, lastTagClose + 1) + '\n<!-- Content truncated -->';
    }
    
    return truncated + '\n<!-- Content truncated -->';
  }

  /**
   * Call LLM API
   */
  async _callLLM(prompt) {
    const apiKey = await apiKeyManager.getKey(this.provider);
    
    if (!apiKey) {
      throw new Error(`No API key configured for ${this.provider}`);
    }

    switch (this.provider) {
      case 'openai':
        return this._callOpenAI(apiKey, prompt);
      case 'anthropic':
        return this._callAnthropic(apiKey, prompt);
      case 'google':
        return this._callGoogle(apiKey, prompt);
      default:
        throw new Error(`Unsupported provider: ${this.provider}`);
    }
  }

  /**
   * Call OpenAI API
   */
  async _callOpenAI(apiKey, prompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a web scraping assistant. Extract data from HTML according to the provided schema. Return ONLY valid JSON, no explanations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * Call Anthropic API
   */
  async _callAnthropic(apiKey, prompt) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.model || 'claude-3-haiku-20240307',
        max_tokens: this.maxTokens,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  /**
   * Call Google AI API
   */
  async _callGoogle(apiKey, prompt) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model || 'gemini-pro'}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            maxOutputTokens: this.maxTokens,
            temperature: this.temperature
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google AI API error: ${error}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }

  /**
   * Parse LLM result
   */
  _parseResult(result, schema) {
    try {
      // Try to extract JSON from response
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : result;
      
      const parsed = JSON.parse(jsonString);
      
      // Validate against schema
      return this._validateAgainstSchema(parsed, schema);
    } catch (error) {
      logger.error('Failed to parse LLM result', { error: error.message });
      throw new Error(`Failed to parse LLM response: ${error.message}`);
    }
  }

  /**
   * Validate result against schema
   */
  _validateAgainstSchema(data, schema) {
    const validated = {};
    
    for (const [field, fieldSchema] of Object.entries(schema)) {
      const value = data[field];
      const expectedType = typeof fieldSchema === 'string' ? 'string' : fieldSchema.type;
      
      if (value === undefined || value === null) {
        validated[field] = null;
      } else if (expectedType === 'array') {
        validated[field] = Array.isArray(value) ? value : [value];
      } else if (expectedType === 'object') {
        validated[field] = typeof value === 'object' ? value : null;
      } else {
        validated[field] = value;
      }
    }
    
    return validated;
  }

  /**
   * Generate cache key
   */
  _generateCacheKey(schema, html) {
    const schemaHash = JSON.stringify(schema);
    const htmlPreview = html.substring(0, 1000);
    return `${schemaHash}:${htmlPreview}`;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Set provider
   */
  setProvider(provider, model = null) {
    this.provider = provider;
    if (model) this.model = model;
  }
}

export default LLMExtractor;
