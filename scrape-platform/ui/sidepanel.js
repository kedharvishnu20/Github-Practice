/**
 * Side Panel JavaScript
 * Main UI logic for the Chrome Extension side panel
 */

import { CONSTANTS } from '../shared/constants.js';

class SidePanelApp {
  constructor() {
    this.currentTab = 'extract';
    this.extractedData = [];
    this.pipelineSteps = [];
    this.jobs = [];
    
    this._init();
  }

  _init() {
    this._setupTabNavigation();
    this._setupExtractHandlers();
    this._setupPipelineHandlers();
    this._setupSettingsHandlers();
    this._loadSettings();
    this._refreshJobs();
    this._loadLogs();
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this._handleMessage(message);
      return true;
    });
  }

  // Tab Navigation
  _setupTabNavigation() {
    const tabs = document.querySelectorAll('.tab');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        this._switchTab(tabName);
      });
    });
  }

  _switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
    
    this.currentTab = tabName;
    
    // Refresh content based on tab
    if (tabName === 'jobs') {
      this._refreshJobs();
    } else if (tabName === 'logs') {
      this._loadLogs();
    }
  }

  // Extract Tab Handlers
  _setupExtractHandlers() {
    // Show/hide custom schema input
    const extractType = document.getElementById('extract-type');
    const customSchemaContainer = document.getElementById('custom-schema-container');
    
    extractType.addEventListener('change', () => {
      customSchemaContainer.classList.toggle('hidden', extractType.value !== 'custom');
    });

    // Extract button
    document.getElementById('btn-extract').addEventListener('click', () => {
      this._runExtraction();
    });

    // Export buttons
    document.getElementById('btn-export-json').addEventListener('click', () => {
      this._exportData('json');
    });
    
    document.getElementById('btn-export-csv').addEventListener('click', () => {
      this._exportData('csv');
    });

    // Clear results
    document.getElementById('btn-clear-results').addEventListener('click', () => {
      this.extractedData = [];
      this._renderResults();
    });
  }

  async _runExtraction() {
    const type = document.getElementById('extract-type').value;
    const useLLM = document.getElementById('use-llm').checked;
    const customSchema = document.getElementById('custom-schema').value;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      let result;
      
      switch (type) {
        case 'links':
          result = await this._extractLinks(tab.id);
          break;
        case 'images':
          result = await this._extractImages(tab.id);
          break;
        case 'tables':
          result = await this._extractTables(tab.id);
          break;
        case 'article':
          result = await this._extractArticle(tab.id);
          break;
        case 'custom':
          result = await this._extractCustom(tab.id, customSchema, useLLM);
          break;
      }

      if (result.success) {
        this.extractedData = result.data || [];
        this._renderResults();
        this._showNotification('Extraction complete!', 'success');
      } else {
        this._showNotification(`Extraction failed: ${result.error}`, 'error');
      }
    } catch (error) {
      this._showNotification(`Error: ${error.message}`, 'error');
    }
  }

  async _extractLinks(tabId) {
    const results = await chrome.tabs.sendMessage(tabId, {
      type: 'EXTRACT',
      payload: {
        selectors: 'a[href]',
        options: { multiple: true }
      }
    });

    const links = Array.from(document.querySelectorAll('a[href]')).map(a => ({
      text: a.textContent.trim(),
      href: a.href
    }));

    return { success: true, data: links };
  }

  async _extractImages(tabId) {
    const images = Array.from(document.querySelectorAll('img')).map(img => ({
      src: img.src,
      alt: img.alt,
      width: img.naturalWidth,
      height: img.naturalHeight
    }));

    return { success: true, data: images };
  }

  async _extractTables(tabId) {
    const tables = Array.from(document.querySelectorAll('table')).map(table => {
      const rows = Array.from(table.querySelectorAll('tr')).map(row => {
        return Array.from(row.querySelectorAll('td, th')).map(cell => cell.textContent.trim());
      });
      return rows;
    });

    return { success: true, data: tables };
  }

  async _extractArticle(tabId) {
    const results = await chrome.tabs.sendMessage(tabId, {
      type: 'ANALYZE',
      payload: {}
    });

    const article = {
      title: document.querySelector('h1')?.textContent.trim() || document.title,
      content: document.querySelector('article')?.textContent.trim() || 
               document.querySelector('.content')?.textContent.trim() || '',
      author: document.querySelector('[rel="author"]')?.textContent.trim() || null,
      date: document.querySelector('time')?.dateTime || null
    };

    return { success: true, data: [article] };
  }

  async _extractCustom(tabId, schemaStr, useLLM) {
    let schema;
    try {
      schema = JSON.parse(schemaStr || '{}');
    } catch (e) {
      return { success: false, error: 'Invalid JSON schema' };
    }

    const results = await chrome.tabs.sendMessage(tabId, {
      type: 'EXTRACT',
      payload: {
        selectors: schema,
        options: { useLLM }
      }
    });

    return results || { success: false, error: 'Extraction failed' };
  }

  _renderResults() {
    const container = document.getElementById('extract-results');
    const stats = document.getElementById('extract-stats');

    if (this.extractedData.length === 0) {
      container.innerHTML = '<p class="placeholder">No data extracted yet</p>';
      stats.textContent = '';
      return;
    }

    container.innerHTML = `<pre>${JSON.stringify(this.extractedData.slice(0, 10), null, 2)}${this.extractedData.length > 10 ? '\n... and more' : ''}</pre>`;
    stats.textContent = `${this.extractedData.length} records extracted`;
  }

  _exportData(format) {
    if (this.extractedData.length === 0) {
      this._showNotification('No data to export', 'warning');
      return;
    }

    let content, mimeType, extension;

    if (format === 'json') {
      content = JSON.stringify(this.extractedData, null, 2);
      mimeType = 'application/json';
      extension = 'json';
    } else {
      // CSV
      const headers = Object.keys(this.extractedData[0] || {});
      const rows = this.extractedData.map(row => 
        headers.map(h => JSON.stringify(row[h] ?? '')).join(',')
      );
      content = [headers.join(','), ...rows].join('\n');
      mimeType = 'text/csv';
      extension = 'csv';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scrape-data-${Date.now()}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);

    this._showNotification('Data exported!', 'success');
  }

  // Pipeline Tab Handlers
  _setupPipelineHandlers() {
    document.getElementById('btn-add-step').addEventListener('click', () => {
      this._addPipelineStep();
    });

    document.getElementById('btn-save-pipeline').addEventListener('click', () => {
      this._savePipeline();
    });

    document.getElementById('btn-run-pipeline').addEventListener('click', () => {
      this._runPipeline();
    });
  }

  _addPipelineStep() {
    const type = document.getElementById('step-type-select').value;
    const step = {
      id: `step_${Date.now()}`,
      type,
      config: {}
    };

    this.pipelineSteps.push(step);
    this._renderPipelineSteps();
  }

  _renderPipelineSteps() {
    const container = document.getElementById('pipeline-steps');
    
    if (this.pipelineSteps.length === 0) {
      container.innerHTML = '<p class="placeholder">No steps added yet</p>';
      return;
    }

    container.innerHTML = this.pipelineSteps.map((step, index) => `
      <div class="step-item" data-index="${index}">
        <span class="step-type">${step.type}</span>
        <span class="step-config">${JSON.stringify(step.config)}</span>
        <div class="step-actions">
          <button class="btn-sm edit-step">✏️</button>
          <button class="btn-sm remove-step">🗑️</button>
        </div>
      </div>
    `).join('');

    // Add event listeners
    container.querySelectorAll('.remove-step').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.closest('.step-item').dataset.index);
        this.pipelineSteps.splice(index, 1);
        this._renderPipelineSteps();
      });
    });
  }

  _savePipeline() {
    const name = document.getElementById('pipeline-name').value || 'Untitled Pipeline';
    
    const pipeline = {
      id: `pipeline_${Date.now()}`,
      name,
      steps: this.pipelineSteps,
      createdAt: Date.now()
    };

    chrome.storage.local.get(['pipelines']).then(result => {
      const pipelines = result.pipelines || [];
      pipelines.push(pipeline);
      chrome.storage.local.set({ pipelines });
      this._showNotification('Pipeline saved!', 'success');
    });
  }

  _runPipeline() {
    const name = document.getElementById('pipeline-name').value || 'Untitled Pipeline';
    
    const pipeline = {
      id: `pipeline_${Date.now()}`,
      name,
      steps: this.pipelineSteps
    };

    chrome.runtime.sendMessage({
      type: CONSTANTS.MESSAGE_TYPES.RUN_PIPELINE,
      payload: { pipeline }
    }).then(response => {
      if (response.success) {
        this._showNotification('Pipeline started!', 'success');
        this._switchTab('jobs');
      } else {
        this._showNotification(`Failed: ${response.error}`, 'error');
      }
    });
  }

  // Jobs Tab
  _refreshJobs() {
    chrome.runtime.sendMessage({
      type: CONSTANTS.MESSAGE_TYPES.GET_STATUS
    }).then(response => {
      this._renderJobs(response.job || {});
    });
  }

  _renderJobs(job) {
    const activeList = document.getElementById('active-jobs-list');
    const historyList = document.getElementById('job-history-list');

    if (!job.id) {
      activeList.innerHTML = '<p class="placeholder">No active jobs</p>';
      return;
    }

    activeList.innerHTML = `
      <div class="job-item">
        <div class="job-header">
          <span>${job.id}</span>
          <span class="job-status ${job.status}">${job.status}</span>
        </div>
        <div class="job-progress">
          <div class="job-progress-bar" style="width: ${job.progress?.percentage || 0}%"></div>
        </div>
        <div style="margin-top: 8px; font-size: 12px;">
          Progress: ${job.progress?.current || 0}/${job.progress?.total || 0}
        </div>
      </div>
    `;
  }

  // Logs Tab
  _loadLogs() {
    chrome.storage.local.get(['scrape_logs']).then(result => {
      const logs = result.scrape_logs || [];
      this._renderLogs(logs);
    });
  }

  _renderLogs(logs) {
    const container = document.getElementById('logs-container');
    const filter = document.getElementById('log-level-filter').value;

    const filteredLogs = filter === 'all' 
      ? logs 
      : logs.filter(log => log.level === filter);

    if (filteredLogs.length === 0) {
      container.innerHTML = '<p class="placeholder">No logs yet</p>';
      return;
    }

    container.innerHTML = filteredLogs.slice(-50).reverse().map(log => `
      <div class="log-entry ${log.level}">
        <span class="log-timestamp">${new Date(log.timestamp).toLocaleTimeString()}</span>
        <span class="log-message">${log.message}</span>
      </div>
    `).join('');
  }

  // Settings
  _setupSettingsHandlers() {
    const modal = document.getElementById('settings-modal');
    
    document.getElementById('btn-settings').addEventListener('click', () => {
      modal.classList.remove('hidden');
    });

    document.getElementById('btn-close-settings').addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    document.getElementById('btn-save-settings').addEventListener('click', () => {
      this._saveSettings();
      modal.classList.add('hidden');
    });
  }

  _loadSettings() {
    chrome.storage.local.get(['settings']).then(result => {
      const settings = result.settings || {};
      
      if (settings.rateLimit) {
        document.getElementById('setting-rate-limit').value = settings.rateLimit;
      }
      if (settings.maxJobs) {
        document.getElementById('setting-max-jobs').value = settings.maxJobs;
      }
      if (settings.compliance) {
        document.getElementById('setting-compliance').value = settings.compliance;
      }
      if (settings.apiProvider) {
        document.getElementById('setting-api-provider').value = settings.apiProvider;
      }
    });
  }

  _saveSettings() {
    const settings = {
      rateLimit: parseInt(document.getElementById('setting-rate-limit').value),
      maxJobs: parseInt(document.getElementById('setting-max-jobs').value),
      compliance: document.getElementById('setting-compliance').value,
      apiProvider: document.getElementById('setting-api-provider').value,
      apiKey: document.getElementById('setting-api-key').value
    };

    chrome.storage.local.set({ settings });

    // Configure API key if provided
    if (settings.apiKey) {
      chrome.runtime.sendMessage({
        type: 'SET_API_KEY',
        payload: {
          provider: settings.apiProvider,
          key: settings.apiKey
        }
      });
    }

    this._showNotification('Settings saved!', 'success');
  }

  // Message Handler
  _handleMessage(message) {
    switch (message.type) {
      case CONSTANTS.MESSAGE_TYPES.JOB_UPDATE:
        this._refreshJobs();
        break;
      case 'PAGE_ANALYZED':
        this._showNotification('Page analyzed!', 'success');
        // Store and display the analysis results
        if (message.payload?.analysis) {
          this.extractedData = [message.payload.analysis];
          this._renderResults();
        }
        break;
      case 'SELECTION_SCRAPED':
        this._showNotification('Selection scraped!', 'success');
        if (message.payload?.text) {
          this.extractedData = [{ text: message.payload.text, url: message.payload.url }];
          this._renderResults();
        }
        break;
      case 'LINK_SCRAPED':
        this._showNotification('Link scraped!', 'success');
        if (message.payload?.url) {
          this.extractedData = [{ url: message.payload.url, text: message.payload.text || '' }];
          this._renderResults();
        }
        break;
    }
  }

  // Notifications
  _showNotification(text, type = 'info') {
    // Simple notification using browser's built-in support or custom
    console.log(`[${type.toUpperCase()}] ${text}`);
  }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  new SidePanelApp();
});
