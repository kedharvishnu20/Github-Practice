# ScrapePlatform - Production-Grade Modular Web Scraping System

A comprehensive, intelligent, and scalable web scraping platform that combines browser automation, DOM-based extraction, AI-assisted extraction, workflow pipelines, and resume/retry capabilities.

## 🚀 Key Optimizations & New Features

### Performance Enhancements
- **Structured DOM Parser**: Converts HTML to XML-like format for reliable XPath/CSS queries
- **Smart Selector Engine**: Auto-detects best extraction method (CSS/XPath/Structured)
- **Multi-level Caching**: L1/L2 cache hierarchy with TTL and automatic eviction
- **Batch Processing**: Queues and batches operations for efficiency
- **Data Streaming**: Stream large datasets without loading into memory
- **Compression Support**: Optional gzip compression for cached data
- **Memory Monitoring**: Real-time heap usage tracking

### New Modules Added

1. **Structured DOM Parser** (`content/structured-dom-parser.js`)
   - Converts messy HTML to clean XML-like tree structure
   - Supports CSS-like queries on structured data
   - Exports to HTML, XML, or JSON formats
   - Built-in caching and performance metrics
   - Handles malformed HTML gracefully

2. **Smart Selector Engine** (`content/smart-selector-engine.js`)
   - Auto-detects optimal extraction method based on selectors and page complexity
   - Configurable fallback chain: CSS → XPath → Structured
   - Batch extraction with concurrency control
   - Success rate tracking per method
   - Smart polling for dynamic content

3. **Performance Optimizer** (`shared/performance-optimizer.js`)
   - L1/L2 cache with automatic tiering based on size/priority
   - Operation batching with configurable delays
   - Memory monitoring with periodic snapshots
   - Compression/decompression using Browser Compression API
   - Memoization, throttling, and debouncing utilities
   - Cached DOM queries with TTL

4. **Plugin System** (`pipeline/plugin-system.js`)
   - Dynamic registration of custom node types
   - Hook system (beforeExecute, afterExecute, onError, onData)
   - Plugin lifecycle management (onRegister, onUnregister)
   - BasePlugin class for easy extension
   - Plugin statistics and health monitoring

5. **Data Streamer** (`data/streamer.js`)
   - Streaming export for large datasets (no memory limits)
   - Multiple formats: JSON, CSV, NDJSON
   - Chunked processing with backpressure control
   - IndexedDB storage backend support
   - Async iterator support for consumption
   - Transform-on-write capability

## 📁 Complete Project Structure

```
scrape-platform/
├── manifest.json                    # Chrome Extension Manifest V3
├── README.md                        # This file
├── shared/
│   ├── constants.js                 # Shared constants
│   ├── logger.js                    # Structured JSON logging
│   ├── utils.js                     # Utility functions
│   └── performance-optimizer.js     # ⭐ NEW: Caching, batching, metrics
├── background/
│   ├── service-worker.js            # Main background script
│   ├── controller.js                # Central orchestration engine
│   ├── rate-limiter.js              # Rate limiting
│   ├── proxy-manager.js             # Proxy rotation
│   ├── api-key-manager.js           # Secure API key management
│   └── job-scheduler.js             # Job scheduling & queuing
├── content/
│   ├── content-script.js            # Page injection script
│   ├── extractor.js                 # Smart DOM extractor (CSS/XPath)
│   ├── page-analyzer.js             # Page type detection
│   ├── paginator.js                 # Pagination handling
│   ├── form-filler.js               # Form interaction
│   ├── captcha-detector.js          # CAPTCHA detection
│   ├── structured-dom-parser.js     # ⭐ NEW: XML-like DOM parsing
│   └── smart-selector-engine.js     # ⭐ NEW: Auto method selection
├── ai/
│   ├── llm-extractor.js             # LLM-based extraction
│   ├── prompt-templates.js          # Multi-provider templates
│   ├── dom-sanitizer.js             # HTML sanitization
│   └── injection-protection.js      # Prompt injection protection
├── pipeline/
│   ├── nodes.js                     # Node abstractions (7 types)
│   ├── engine.js                    # Pipeline execution engine
│   └── plugin-system.js             # ⭐ NEW: Plugin architecture
├── checkpoint/
│   └── job-checkpoint.js            # Resume/retry system
├── ethics/
│   ├── robots-parser.js             # robots.txt compliance
│   └── pii-detector.js              # PII detection & redaction
├── data/
│   └── streamer.js                  # ⭐ NEW: Streaming exports
├── ui/
│   ├── sidepanel.html               # Side panel UI
│   ├── sidepanel.css                # Styles
│   ├── sidepanel.js                 # UI logic
│   └── icons/                       # Extension icons
└── examples/
    ├── sample-pipeline.json         # Example pipeline
    └── extraction-flow.js           # Usage examples
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
