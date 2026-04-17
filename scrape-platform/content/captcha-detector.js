/**
 * CAPTCHA Detector
 * Detects common CAPTCHA challenges on pages
 */

class CaptchaDetector {
  constructor() {
    this.captchaTypes = {
      RECAPTCHA: 'recaptcha',
      HCAPTCHA: 'hcaptcha',
      CLOUDFLARE: 'cloudflare',
      IMAGE_CAPTCHA: 'image_captcha',
      TEXT_CAPTCHA: 'text_captcha',
      MATH_CAPTCHA: 'math_captcha',
      UNKNOWN: 'unknown'
    };

    this.indicators = {
      recaptcha: [
        '.g-recaptcha',
        '[data-sitekey]',
        'iframe[src*="recaptcha"]',
        '#recaptcha'
      ],
      hcaptcha: [
        '.h-captcha',
        'iframe[src*="hcaptcha"]'
      ],
      cloudflare: [
        '#cf-wrapper',
        '.cf-browser-verification',
        'iframe[src*="challenges"]',
        '[data-ray]'
      ],
      imageCaptcha: [
        'img[alt*="captcha"]',
        'img[alt*="security"]',
        'img[src*="captcha"]',
        '.captcha-img'
      ],
      textCaptcha: [
        '[class*="captcha"] input[type="text"]',
        '[id*="captcha"] input',
        'label[class*="captcha"]',
        'label[id*="captcha"]'
      ]
    };
  }

  /**
   * Detect if CAPTCHA is present
   */
  async detect() {
    // Check for known CAPTCHA elements
    for (const [type, selectors] of Object.entries(this.indicators)) {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          return true;
        }
      }
    }

    // Check for CAPTCHA-related text
    const captchaTextPatterns = [
      /verify you are human/i,
      /complete the security check/i,
      /enter the characters below/i,
      /type the characters above/i,
      /prove you are not a robot/i,
      /anti-bot verification/i,
      /security challenge/i
    ];

    const pageText = document.body.textContent;
    for (const pattern of captchaTextPatterns) {
      if (pattern.test(pageText)) {
        return true;
      }
    }

    // Check for suspicious iframe patterns
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      const src = iframe.src.toLowerCase();
      if (src.includes('recaptcha') || 
          src.includes('hcaptcha') || 
          src.includes('challenge') ||
          src.includes('verify')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get detected CAPTCHA type
   */
  getCaptchaType() {
    for (const [type, selectors] of Object.entries(this.indicators)) {
      for (const selector of selectors) {
        if (document.querySelector(selector)) {
          return type === 'imageCaptcha' ? this.captchaTypes.IMAGE_CAPTCHA :
                 type === 'textCaptcha' ? this.captchaTypes.TEXT_CAPTCHA :
                 this.captchaTypes[type.toUpperCase()] || this.captchaTypes.UNKNOWN;
        }
      }
    }
    return null;
  }

  /**
   * Get CAPTCHA details
   */
  getDetails() {
    const details = {
      detected: false,
      type: null,
      selector: null,
      solvable: false,
      message: null
    };

    for (const [type, selectors] of Object.entries(this.indicators)) {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          details.detected = true;
          details.type = type;
          details.selector = selector;
          details.solvable = this._isSolvable(type);
          details.message = this._getMessage(type);
          return details;
        }
      }
    }

    return details;
  }

  /**
   * Check if CAPTCHA is potentially solvable
   */
  _isSolvable(type) {
    // Most automated CAPTCHA solving is unreliable and against ToS
    // Return false to indicate manual intervention needed
    return false;
  }

  /**
   * Get user-friendly message
   */
  _getMessage(type) {
    const messages = {
      recaptcha: 'Google reCAPTCHA detected. Manual verification required.',
      hcaptcha: 'hCaptcha detected. Manual verification required.',
      cloudflare: 'Cloudflare protection detected. Manual verification required.',
      imageCaptcha: 'Image CAPTCHA detected. Manual verification required.',
      textCaptcha: 'Text CAPTCHA detected. Manual verification required.',
      mathCaptcha: 'Math CAPTCHA detected. Manual verification required.'
    };
    return messages[type] || 'CAPTCHA detected. Manual verification required.';
  }

  /**
   * Wait for CAPTCHA to be solved (polling)
   */
  async waitForSolution(timeout = 60000, interval = 2000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const hasCaptcha = await this.detect();
      
      if (!hasCaptcha) {
        return { solved: true, timeTaken: Date.now() - startTime };
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    return { solved: false, timedOut: true };
  }

  /**
   * Get all potential CAPTCHA elements
   */
  getAllPotentialCaptchas() {
    const elements = [];
    
    for (const [type, selectors] of Object.entries(this.indicators)) {
      for (const selector of selectors) {
        const matches = document.querySelectorAll(selector);
        matches.forEach(el => {
          elements.push({
            type,
            selector,
            element: el,
            visible: this._isVisible(el)
          });
        });
      }
    }
    
    return elements;
  }

  /**
   * Check if element is visible
   */
  _isVisible(element) {
    if (!element) return false;
    
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0
    );
  }
}

export default CaptchaDetector;
