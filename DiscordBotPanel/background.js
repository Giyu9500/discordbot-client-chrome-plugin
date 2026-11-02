// Kliknięcie ikonki otwiera jedną kartę panelu, zamiast tworzyć wiele sesji Gateway.
async function openPanel() {
  const page = chrome.runtime.getURL('panel.html');
  const { panelTabId } = await chrome.storage.session.get('panelTabId');
  if (Number.isInteger(panelTabId)) {
    try {
      const tab = await chrome.tabs.get(panelTabId);
      if (tab?.id) {
        await chrome.tabs.update(tab.id, { active: true });
        if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
        return;
      }
    } catch (_) {
      // Karta nie istnieje, otwieramy nową.
    }
  }
  const tab = await chrome.tabs.create({ url: page });
  if (tab.id) await chrome.storage.session.set({ panelTabId: tab.id });
}

chrome.action.onClicked.addListener(() => { openPanel().catch(() => chrome.tabs.create({ url: chrome.runtime.getURL('panel.html') })); });

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') openPanel();
});

chrome.tabs.onRemoved.addListener(async tabId => {
  const { panelTabId } = await chrome.storage.session.get('panelTabId');
  if (tabId === panelTabId) await chrome.storage.session.remove('panelTabId');
});
