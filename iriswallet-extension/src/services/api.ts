const API_URL = 'http://localhost:5000';

export async function scanIris() {
  const res = await fetch(`${API_URL}/api/scan`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Scan error');
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
    throw new Error(err.error || "Registration error");
  }
  return res.json();
}
