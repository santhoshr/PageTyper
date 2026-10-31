const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const ignorePunctuation = document.getElementById('ignorePunctuation');
const ignoreCase = document.getElementById('ignoreCase');
const autoScroll = document.getElementById('autoScroll');
const toggleBtn = document.getElementById('toggleExtension');

// Load stored settings
browserAPI.storage?.sync?.get(['pageTyperConfig'], (result) => {
  if (result && result.pageTyperConfig) {
    ignorePunctuation.checked = !!result.pageTyperConfig.ignorePunctuation;
    ignoreCase.checked = !!result.pageTyperConfig.ignoreCase;
    autoScroll.checked = !!result.pageTyperConfig.autoScroll;
  }
});

function saveAndNotify() {
  const config = {
    ignorePunctuation: ignorePunctuation.checked,
    ignoreCase: ignoreCase.checked,
    autoScroll: autoScroll.checked,
  };
  browserAPI.storage?.sync?.set({ pageTyperConfig: config });

  // Relay to current tab
  browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      browserAPI.tabs.sendMessage(tabs[0].id, {
        action: 'UPDATE_CONFIG',
        config: config,
      });
    }
  });
}

ignorePunctuation.addEventListener('change', saveAndNotify);
ignoreCase.addEventListener('change', saveAndNotify);
autoScroll.addEventListener('change', saveAndNotify);

toggleBtn.addEventListener('click', () => {
  browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      browserAPI.tabs.sendMessage(tabs[0].id, { action: 'TOGGLE_PAGETYPER' }, (response) => {
        if (response) {
          toggleBtn.textContent = response.status ? 'PageTyper: Active' : 'PageTyper: Inactive';
        }
      });
    }
  });
});
