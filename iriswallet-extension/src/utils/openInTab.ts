/**
 * Returns true if WebHID is available in the current context.
 */
export function isWebHIDAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'hid' in navigator;
}

/**
 * Returns true if running in an extension popup (not a full tab).
 */
export function isPopup(): boolean {
  try {
    return typeof chrome !== 'undefined'
      && !!chrome.runtime?.id
      && window.innerWidth < 800;
  } catch {
    return false;
  }
}

/**
 * Opens the extension in a full browser tab with optional URL params to restore state.
 * The popup closes automatically.
 */
export function openInTab(params?: Record<string, string>) {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    const url = new URL(chrome.runtime.getURL('index.html'));
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    chrome.tabs.create({ url: url.toString() });
    window.close();
  }
}

/**
 * Reads URL params (used after openInTab redirects to a full tab).
 */
export function getTabParams(): Record<string, string> {
  const params: Record<string, string> = {};
  try {
    const url = new URL(window.location.href);
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });
  } catch {}
  return params;
}
