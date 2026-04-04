const API_URL = 'http://localhost:5000';

export async function scanIris() {
  const res = await fetch(`${API_URL}/api/scan`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur lors du scan');
  }
  return res.json();
}

export async function register(walletName: string, walletAddress: string) {
  const res = await fetch(`${API_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletName, walletAddress }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erreur lors de l'enregistrement");
  }
  return res.json();
}

/**
 * Submit a wallet address for CRE iris verification.
 * The backend captures a fresh scan and queues it for the Chainlink CRE workflow.
 */
export async function submitForCRE(walletAddress: string): Promise<{ nonce: number; irisHash: string }> {
  const res = await fetch(`${API_URL}/api/cre/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur lors de la soumission CRE');
  }
  return res.json();
}
