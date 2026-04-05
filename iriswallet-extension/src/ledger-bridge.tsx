/**
 * Ledger Bridge — runs on localhost:5173 where WebHID works.
 * After getting the result, POSTs it to the backend API so the extension can poll for it.
 */

const DERIVATION_PATH = "44'/60'/0'/0/0";
const API_URL = 'http://localhost:5000';

async function connectLedger() {
  const Eth = (await import('@ledgerhq/hw-app-eth')).default;
  const TransportWebHID = (await import('@ledgerhq/hw-transport-webhid')).default;
  const transport = await TransportWebHID.create();
  return new Eth(transport);
}

async function postResult(data: any) {
  await fetch(`${API_URL}/api/ledger-result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

async function run() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('ledgerAction');
  const statusEl = document.getElementById('status')!;
  const errorEl = document.getElementById('error')!;

  try {
    if (action === 'getAddress') {
      statusEl.textContent = 'Connecting to Ledger...';
      const eth = await connectLedger();
      try {
        const result = await eth.getAddress(DERIVATION_PATH);
        await postResult({ success: true, action, address: result.address });
        statusEl.textContent = `Connected! Address: ${result.address.slice(0, 10)}...${result.address.slice(-4)}`;
      } finally {
        await eth.transport.close();
      }
    } else if (action === 'signMessage') {
      const hash = params.get('hash') || '';
      statusEl.textContent = 'Please confirm on your Ledger device...';
      const eth = await connectLedger();
      try {
        const sig = await eth.signPersonalMessage(DERIVATION_PATH, hash);
        const v = (typeof sig.v === 'number' ? sig.v : parseInt(sig.v as string, 16));
        const signature = `0x${sig.r}${sig.s}${v.toString(16).padStart(2, '0')}`;
        await postResult({ success: true, action, signature });
        statusEl.textContent = 'Signed successfully!';
      } finally {
        await eth.transport.close();
      }
    }

    statusEl.textContent += '\n\nDone! You can close this tab and reopen the extension.';

  } catch (e: any) {
    const msg = e.message || 'Ledger connection failed';
    errorEl.textContent = msg;
    await postResult({ success: false, action, error: msg });
  }
}

const params = new URLSearchParams(window.location.search);
const action = params.get('ledgerAction');
const label = action === 'signMessage' ? 'Sign with Ledger' : 'Connect Ledger';

document.getElementById('root')!.innerHTML = `
  <div style="font-family: system-ui; max-width: 500px; margin: 80px auto; text-align: center;">
    <h2 style="margin-bottom: 8px;">IrisWallet — Ledger Bridge</h2>
    <p style="color: #666; margin-bottom: 32px;">Make sure your Ledger is plugged in, unlocked, and the Ethereum app is open.</p>
    <button id="connectBtn" style="
      background: #6366f1; color: white; border: none; padding: 14px 32px;
      border-radius: 8px; font-size: 16px; cursor: pointer;
    ">${label}</button>
    <p id="status" style="font-size: 16px; margin-top: 24px; white-space: pre-line;"></p>
    <p id="error" style="color: red; margin-top: 12px;"></p>
  </div>
`;

document.getElementById('connectBtn')!.addEventListener('click', () => {
  const btn = document.getElementById('connectBtn') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Connecting...';
  run();
});
