/**
 * Shared Constants
 * Centralized constants used across the platform
 */

export const CONSTANTS = {
  // Job statuses
  JOB_STATUS: {
    PENDING: 'pending',
    RUNNING: 'running',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
  },

  // Node types for pipelines
  NODE_TYPES: {
    NAVIGATE: 'navigate',
    EXTRACT: 'extract',
    CLICK: 'click',
    SCROLL: 'scroll',
    PAGINATE: 'paginate',
    TRANSFORM: 'transform',
    EXPORT: 'export',
    WAIT: 'wait',
    CONDITIONAL: 'conditional',
    LOOP: 'loop',
    SCRIPT: 'script'
  },

  // Compliance levels
  COMPLIANCE_LEVEL: {
    STRICT: 'strict',
    WARN: 'warn',
    IGNORE: 'ignore'
  },

  // Extraction methods
  EXTRACTION_METHOD: {
    CSS: 'css',
    XPATH: 'xpath',
    LLM: 'llm',
    HYBRID: 'hybrid'
  },

  // Rate limiting defaults
  RATE_LIMIT: {
    DEFAULT_DELAY_MS: 1000,
    MIN_DELAY_MS: 500,
    MAX_DELAY_MS: 10000,
    REQUESTS_PER_MINUTE: 60
  },

  // Retry configuration
  RETRY: {
    MAX_ATTEMPTS: 3,
    BASE_DELAY_MS: 1000,
    MAX_DELAY_MS: 30000,
    BACKOFF_MULTIPLIER: 2
  },

  // Checkpoint configuration
  CHECKPOINT: {
    BUFFER_SIZE: 100,
    AUTO_SAVE_INTERVAL_MS: 30000,
    MAX_CHECKPOINTS: 10
  },

  // LLM configuration
  LLM: {
    MAX_TOKENS: 4096,
    TEMPERATURE: 0.1,
    TIMEOUT_MS: 30000,
    MAX_RETRIES: 2
  },

  // Data export formats
  EXPORT_FORMAT: {
    JSON: 'json',
    CSV: 'csv',
    NDJSON: 'ndjson'
  },

  // Message types for communication
  MESSAGE_TYPES: {
    START_JOB: 'START_JOB',
    STOP_JOB: 'STOP_JOB',
    PAUSE_JOB: 'PAUSE_JOB',
    RESUME_JOB: 'RESUME_JOB',
    GET_STATUS: 'GET_STATUS',
    JOB_UPDATE: 'JOB_UPDATE',
    LOG_MESSAGE: 'LOG_MESSAGE',
    EXTRACT_DATA: 'EXTRACT_DATA',
    ANALYZE_PAGE: 'ANALYZE_PAGE',
    RUN_PIPELINE: 'RUN_PIPELINE',
    PIPELINE_COMPLETE: 'PIPELINE_COMPLETE',
    ERROR: 'ERROR'
  },

  // Error types
  ERROR_TYPES: {
    NETWORK_ERROR: 'NETWORK_ERROR',
    TIMEOUT_ERROR: 'TIMEOUT_ERROR',
    PARSE_ERROR: 'PARSE_ERROR',
    SELECTOR_ERROR: 'SELECTOR_ERROR',
    RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
    CAPTCHA_ERROR: 'CAPTCHA_ERROR',
    BLOCKED_ERROR: 'BLOCKED_ERROR',
    CONFIG_ERROR: 'CONFIG_ERROR',
    SYSTEM_ERROR: 'SYSTEM_ERROR'
  }
};

export default CONSTANTS;
