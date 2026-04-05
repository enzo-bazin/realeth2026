import type { Hex } from 'viem';

const LEDGER_BRIDGE_URL = 'http://localhost:5173/ledger.html';
const API_URL = 'http://localhost:5000';
const REGISTER_STATE_KEY = 'iriswallet_register_state';
const SEND_STATE_KEY = 'iriswallet_send_state';

/**
 * Open the Ledger bridge and save register state.
 */
export function requestLedgerAddress(walletName: string) {
  localStorage.setItem(REGISTER_STATE_KEY, JSON.stringify({ walletName }));
  clearBackendResult();

  const url = new URL(LEDGER_BRIDGE_URL);
  url.searchParams.set('ledgerAction', 'getAddress');
  window.open(url.toString(), '_blank');
}

/**
 * Open the Ledger bridge for signing and save send state.
 */
export function requestLedgerSign(messageHash: Hex, sendState: { to: string; amount: string; irisSig: string }) {
  localStorage.setItem(SEND_STATE_KEY, JSON.stringify(sendState));
  clearBackendResult();

  const url = new URL(LEDGER_BRIDGE_URL);
  url.searchParams.set('ledgerAction', 'signMessage');
  url.searchParams.set('hash', messageHash.slice(2));
  window.open(url.toString(), '_blank');
}

/**
 * Poll the backend for Ledger result.
 */
export async function pollLedgerResult(): Promise<{ address?: string; signature?: string; error?: string } | null> {
  try {
    const res = await fetch(`${API_URL}/api/ledger-result`);
    const data = await res.json();
    if (data.pending) return null;
    if (data.success) return { address: data.address, signature: data.signature };
    if (data.error) return { error: data.error };
    return null;
  } catch {
    return null;
  }
}

function clearBackendResult() {
  fetch(`${API_URL}/api/ledger-result`, { method: 'DELETE' }).catch(() => {});
}

export function clearLedgerPending() {
  localStorage.removeItem(REGISTER_STATE_KEY);
  localStorage.removeItem(SEND_STATE_KEY);
  clearBackendResult();
}

// Keep for backward compat — not used anymore
export function checkUrlForLedgerResult() { return null; }
