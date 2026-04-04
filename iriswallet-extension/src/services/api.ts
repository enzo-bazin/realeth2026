const API_URL = 'http://localhost:3001';

export async function authenticate(irisHash: string) {
  const res = await fetch(`${API_URL}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ irisHash }),
  });
  return res.json();
}

export async function register(irisHash: string, walletName: string) {
  const res = await fetch(`${API_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ irisHash, walletName }),
  });
  return res.json();
}
