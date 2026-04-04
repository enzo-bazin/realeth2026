/**
 * Opens the extension in a full browser tab where WebHID is available.
 * Falls back to window.open for non-extension contexts.
 */
export function openInTab() {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    // Close the popup and open in a full tab
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    window.close();
  } else {
    // Already in a tab or dev mode — no-op
  }
}

/**
 * Returns true if WebHID is available in the current context.
 */
export function isWebHIDAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'hid' in navigator;
}

/**
 * Returns true if we're running inside an extension popup (small window).
 */
export function isExtensionPopup(): boolean {
  if (typeof chrome === 'undefined' || !chrome.extension) return false;
  const views = chrome.extension.getViews?.({ type: 'popup' });
  return views ? views.includes(window) : window.innerWidth < 500;
}
