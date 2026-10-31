// PageTyper - Background Service Worker
// Cross-browser compatibility shim (supports chrome.* and browser.* APIs)
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

browserAPI.runtime.onInstalled.addListener(() => {
  console.log('PageTyper installed successfully.');
});

// Relay commands or handle action clicks if needed
browserAPI.commands?.onCommand?.addListener((command) => {
  if (command === 'toggle-pagetyper') {
    browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        browserAPI.tabs.sendMessage(tabs[0].id, { action: 'TOGGLE_PAGETYPER' });
      }
    });
  }
});
