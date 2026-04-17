/**
 * Popup script
 * Handles popup UI interactions
 */

document.getElementById('btn-open-panel').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.error('Failed to open side panel:', e);
  }
});

document.getElementById('btn-analyze').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // First open the side panel
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.error('Failed to open side panel:', e);
  }
  
  // Send analyze message to content script
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'ANALYZE_PAGE' });
    console.log('Analyze page message sent');
  } catch (e) {
    console.error('Failed to send analyze message:', e);
  }
});
