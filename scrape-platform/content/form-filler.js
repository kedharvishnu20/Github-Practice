/**
 * Form Filler
 * Handles form detection and filling with human-like behavior
 */

class FormFiller {
  constructor() {
    this.fillDelay = { min: 100, max: 500 };
  }

  /**
   * Fill form fields
   */
  async fill(fields, submit = false) {
    const results = {
      success: true,
      filledCount: 0,
      errors: []
    };

    for (const [selector, value] of Object.entries(fields)) {
      try {
        await this._fillField(selector, value);
        results.filledCount++;
      } catch (error) {
        results.errors.push({ selector, error: error.message });
        results.success = false;
      }
    }

    if (submit && results.success) {
      await this._submitForm();
    }

    return results;
  }

  /**
   * Fill a single field
   */
  async _fillField(selector, value) {
    const element = document.querySelector(selector);
    
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    // Scroll into view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Human-like delay before interaction
    await this._humanDelay();

    // Focus
    element.focus();
    await this._humanDelay();

    const tagName = element.tagName.toLowerCase();
    const type = element.type?.toLowerCase();

    switch (tagName) {
      case 'input':
        await this._fillInput(element, type, value);
        break;
      case 'textarea':
        await this._fillTextarea(element, value);
        break;
      case 'select':
        await this._fillSelect(element, value);
        break;
      default:
        // Try to set value directly
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Blur
    element.blur();
    await this._humanDelay();
  }

  /**
   * Fill input element
   */
  async _fillInput(element, type, value) {
    if (type === 'checkbox' || type === 'radio') {
      element.checked = Boolean(value);
    } else if (type === 'file') {
      // File inputs need special handling
      const dataTransfer = new DataTransfer();
      // Note: Can't programmatically set file inputs for security
      console.warn('Cannot programmatically set file inputs');
    } else {
      // Clear existing value
      element.value = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Type character by character for human-like behavior
      const stringValue = String(value);
      for (const char of stringValue) {
        element.value += char;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        await this._humanDelay(50, 150);
      }
    }

    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Fill textarea element
   */
  async _fillTextarea(element, value) {
    element.value = '';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    
    const stringValue = String(value);
    for (const char of stringValue) {
      element.value += char;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await this._humanDelay(30, 100);
    }

    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Fill select element
   */
  async _fillSelect(element, value) {
    const options = Array.from(element.options);
    const matchingOption = options.find(opt => 
      opt.value === value || opt.text === value
    );

    if (matchingOption) {
      element.value = matchingOption.value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      throw new Error(`Option not found: ${value}`);
    }
  }

  /**
   * Submit form
   */
  async _submitForm() {
    const forms = document.forms;
    if (forms.length === 0) {
      throw new Error('No forms found');
    }

    // Submit first form or most recently interacted form
    const form = forms[0];
    
    await this._humanDelay(200, 500);
    
    // Click submit button if exists
    const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
    if (submitButton) {
      submitButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this._humanDelay();
      submitButton.click();
    } else {
      // Submit programmatically
      form.submit();
    }
  }

  /**
   * Human-like delay
   */
  async _humanDelay(min = this.fillDelay.min, max = this.fillDelay.max) {
    const delay = min + Math.random() * (max - min);
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Find form fields automatically
   */
  findFields(formSelector = null) {
    const form = formSelector ? document.querySelector(formSelector) : document;
    const fields = {};

    const inputs = form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
    const textareas = form.querySelectorAll('textarea');
    const selects = form.querySelectorAll('select');

    [...inputs, ...textareas, ...selects].forEach(el => {
      const key = el.name || el.id || el.placeholder || '';
      if (key) {
        fields[key] = {
          selector: this._getElementSelector(el),
          type: el.tagName.toLowerCase(),
          inputType: el.type || null,
          required: el.required || false,
          placeholder: el.placeholder || null
        };
      }
    });

    return fields;
  }

  /**
   * Get element selector
   */
  _getElementSelector(element) {
    if (element.id) return `#${element.id}`;
    if (element.name) return `[name="${element.name}"]`;
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c).slice(0, 2).join('.');
      if (classes) return `${element.tagName.toLowerCase()}.${classes}`;
    }
    return element.tagName.toLowerCase();
  }
}

export default FormFiller;
