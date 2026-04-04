const KNOWN_HASH = 'abc123def456789';

function generateRandomHash(): string {
  const chars = '0123456789abcdef';
  let hash = '';
  for (let i = 0; i < 40; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

export function scanIris(mode: 'known' | 'new'): string {
  if (mode === 'known') return KNOWN_HASH;
  return generateRandomHash();
}
