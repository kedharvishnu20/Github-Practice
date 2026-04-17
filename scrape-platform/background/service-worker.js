/**
 * Service Worker (Background Script)
 * Main entry point for the Chrome Extension background process
 */

import { controller } from './controller.js';
import Logger from '../shared/logger.js';

const logger = new Logger({ module: 'service-worker' });

logger.info('Service worker starting...');

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
  logger.info('Extension installed', { 
    reason: details.reason,
    version: chrome.runtime.getManifest().version
  });

  // Set up context menu items
  setupContextMenu();
});

// Set up context menu
function setupContextMenu() {
  chrome.contextMenus.create({
    id: 'scrape-selection',
    title: 'Scrape Selection',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'scrape-page',
    title: 'Analyze Page',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'scrape-link',
    title: 'Scrape This Link',
    contexts: ['link']
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  logger.info('Context menu clicked', { 
    menuItemId: info.menuItemId,
    tabId: tab?.id 
  });

  switch (info.menuItemId) {
    case 'scrape-selection':
      await handleScrapeSelection(tab, info);
      break;
      
    case 'scrape-page':
      await handleAnalyzePage(tab);
      break;
      
    case 'scrape-link':
      await handleScrapeLink(tab, info);
      break;
  }
});

// Handle scrape selection
async function handleScrapeSelection(tab, info) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString()
    });

    const selectedText = results[0]?.result;
    
    if (selectedText) {
      // Open side panel with selection
      await chrome.sidePanel.open({ tabId: tab.id });
      
      // Send message to side panel
      chrome.runtime.sendMessage({
        type: 'SELECTION_SCRAPED',
        payload: {
          text: selectedText,
          url: info.pageUrl
        }
      }).catch(() => {});
    }
  } catch (error) {
    logger.error('Scrape selection failed', { error: error.message });
  }
}

// Handle analyze page
async function handleAnalyzePage(tab) {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
    
    chrome.tabs.sendMessage(tab.id, {
      type: 'ANALYZE_PAGE'
    }).catch(() => {});
  } catch (error) {
    logger.error('Analyze page failed', { error: error.message });
  }
}

// Handle scrape link
async function handleScrapeLink(tab, info) {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
    
    chrome.runtime.sendMessage({
      type: 'LINK_SCRAPED',
      payload: {
        url: info.linkUrl,
        text: info.linkText
      }
    }).catch(() => {});
  } catch (error) {
    logger.error('Scrape link failed', { error: error.message });
  }
}

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  logger.debug('Command received', { command });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab) return;

  switch (command) {
    case 'toggle-side-panel':
      await chrome.sidePanel.open({ tabId: tab.id });
      break;
      
    case 'start-scraping':
      chrome.tabs.sendMessage(tab.id, {
        type: 'START_SCRAPING'
      }).catch(() => {});
      break;
      
    case 'stop-scraping':
      chrome.tabs.sendMessage(tab.id, {
        type: 'STOP_SCRAPING'
      }).catch(() => {});
      break;
  }
});

// Keep service worker alive during long operations
let keepAliveInterval;

function startKeepAlive() {
  if (keepAliveInterval) return;
  
  keepAliveInterval = setInterval(() => {
    // Perform a trivial async operation to keep SW alive
    chrome.storage.local.get(['_keepalive']).catch(() => {});
  }, 20000); // 20 seconds
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// Handle messages that might need keep-alive
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'KEEP_ALIVE_START') {
    startKeepAlive();
    sendResponse({ status: 'started' });
  } else if (message.type === 'KEEP_ALIVE_STOP') {
    stopKeepAlive();
    sendResponse({ status: 'stopped' });
  }
  return true;
});

// Clean up on suspend
self.addEventListener('unload', () => {
  stopKeepAlive();
  logger.info('Service worker unloading');
});

logger.info('Service worker initialized');
