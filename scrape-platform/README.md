# ScrapePlatform - Production-Grade Modular Web Scraping System

## 📁 Project Structure

```
scrape-platform/
├── manifest.json                 # Chrome Extension Manifest V3
├── config/
│   ├── settings.js               # Global configuration
│   └── schemas.js                # Data schemas
├── shared/
│   ├── logger.js                 # Structured JSON logging
│   ├── types.js                  # JSDoc type definitions
│   ├── constants.js              # Shared constants
│   └── utils.js                  # Utility functions
├── background/
│   ├── service-worker.js         # Main background script
│   ├── controller.js             # Central orchestration engine
│   ├── rate-limiter.js           # Rate limiting
│   ├── proxy-manager.js          # Proxy rotation
│   ├── api-key-manager.js        # API key management
│   └── job-scheduler.js          # Job scheduling
├── content/
│   ├── content-script.js         # Main content script
│   ├── extractor.js              # Smart DOM extractor
│   ├── page-analyzer.js          # Page type detection
│   ├── paginator.js              # Pagination handling
│   ├── form-filler.js            # Form interaction
│   └── captcha-detector.js       # CAPTCHA detection
├── ai/
│   ├── llm-extractor.js          # LLM-based extraction
│   ├── prompt-templates.js       # Prompt templates
│   ├── dom-sanitizer.js          # DOM sanitization for LLM
│   └── injection-protection.js   # Prompt injection protection
├── pipeline/
│   ├── compiler.js               # Pipeline compiler
│   ├── engine.js                 # Execution engine
│   ├── nodes.js                  # Node abstractions
│   └── registry.js               # Node registry
├── emitters/
│   ├── nodejs-emitter.js         # Playwright Node.js emitter
│   └── python-emitter.js         # Python emitter
├── checkpoint/
│   ├── cursor-tracker.js         # Cursor tracking
│   ├── row-buffer.js             # Row buffering
│   └── job-checkpoint.js         # Job checkpoints
├── data/
│   ├── parsers.js                # Data parsers
│   ├── transformers.js           # Data transformers
│   └── exporters.js              # JSON/CSV exporters
├── ethics/
│   ├── robots-parser.js          # robots.txt parser
│   ├── pii-detector.js           # PII detection
│   └── compliance-engine.js      # Compliance enforcement
├── reliability/
│   ├── retry-handler.js          # Exponential backoff
│   ├── ua-rotator.js             # User-agent rotation
│   └── playwright-fallback.js    # Playwright fallback
├── ui/
│   ├── sidepanel.html            # Side panel UI
│   ├── sidepanel.css             # Styles
│   ├── sidepanel.js              # Side panel logic
│   └── components/
│       ├── pipeline-editor.js    # Visual pipeline editor
│       ├── job-runner.js         # Job runner UI
│       └── log-viewer.js         # Log viewer
├── backend/
│   ├── nodejs/
│   │   ├── server.js             # Node.js backend
│   │   └── scraper.js            # Node.js scraper service
│   └── python/
│       ├── server.py             # Python backend
│       └── scraper.py            # Python scraper service
└── examples/
    ├── sample-pipeline.json      # Sample pipeline
    └── extraction-flow.js        # Example extraction flow
```

## 🚀 Quick Start

### Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `scrape-platform` folder
5. The extension icon will appear in your toolbar

### Backend (Node.js)

```bash
cd backend/nodejs
npm install
node server.js
```

### Backend (Python)

```bash
cd backend/python
pip install -r requirements.txt
python server.py
```

## 📋 Features

- **Modular Architecture**: Clean separation of concerns
- **Browser Automation**: Chrome Extension + Playwright support
- **AI-Assisted Extraction**: LLM-based structured data extraction
- **Visual Pipeline Builder**: Create scraping workflows visually
- **Resume/Retry**: Checkpoint system for crash recovery
- **Ethics & Compliance**: robots.txt, PII detection, configurable enforcement
- **Anti-Bot Measures**: Rate limiting, proxy rotation, UA rotation
- **Streaming Export**: Handle large datasets efficiently
- **Structured Logging**: JSON logs with job IDs and tracing

## 🔐 Security

- API keys stored securely (never exposed to frontend)
- DOM sanitization for LLM inputs
- Prompt injection protection
- Secure storage via Chrome storage API

## ⚡ Performance

- Deterministic extraction first (CSS/XPath)
- LLM calls only when needed
- Streaming for large datasets
- Efficient DOM querying

## 🧪 Observability

- Structured JSON logging
- Job ID tracking
- Step-level tracing
- Error classification

## 📄 License

MIT
