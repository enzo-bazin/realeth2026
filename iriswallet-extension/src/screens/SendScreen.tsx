import { useState, useRef } from 'react';
import { useWallet } from '../context/WalletContext';
import { sendTransaction, getBalance } from '../services/blockchain';
import { formatEther, type Address } from 'viem';

const API_URL = 'http://localhost:5000';

type Step = 'form' | 'signing' | 'success';

export default function SendScreen() {
  const { wallet, setWallet, setScreen } = useWallet();
  const [to, setTo] = useState('0x3656Ff4C11C4C8b4b77402fAab8B3387E36f2e77');
  const [amount, setAmount] = useState('0.0001');
  const [step, setStep] = useState<Step>('form');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);

  if (!wallet) return null;

  const startIrisScan = () => {
    if (!to.trim() || !to.startsWith('0x')) { setError('Invalid address'); return; }
    if (!parseFloat(amount) || parseFloat(amount) <= 0) { setError('Invalid amount'); return; }

    setError('');
    setStep('signing');
    setStatus('Place your eye in front of the camera...');

    const es = new EventSource(`${API_URL}/api/autoscan`);
    eventSourceRef.current = es;

    es.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === 'scanning') { setStatus('Scanning your iris...'); return; }

        es.close();
        eventSourceRef.current = null;

        if (data.status !== 'found') {
          setError('Iris not recognized — transaction denied');
          setStep('form');
          return;
        }

        setStatus('Iris verified — sending...');
        try {
          const hash = await sendTransaction(
            wallet.walletAddress as Address,
            to.trim() as Address,
            amount,
          );
          setTxHash(hash);
          setStep('success');

          const bal = await getBalance(wallet.walletAddress as Address);
          setWallet({ ...wallet, balance: formatEther(bal) });
        } catch (e: any) {
          setError(e.message?.includes('insufficient') ? 'Insufficient balance' : (e.message || 'Send error'));
          setStep('form');
        }
      } catch { /* ignore */ }
    };

    es.onerror = () => {
      setError('Connection to server lost');
      es.close();
      eventSourceRef.current = null;
      setStep('form');
    };
  };

  const cancelScan = () => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    fetch(`${API_URL}/api/autoscan/stop`, { method: 'POST' }).catch(() => {});
    setStep('form');
  };

  return (
    <div className="screen">
      <div className="logo-section">
        <h1 className="title">Send ETH</h1>
        <p className="subtitle">{step === 'signing' ? 'Iris scan to authorize' : 'An iris scan is required to sign'}</p>
      </div>

      {step === 'success' ? (
        <div className="dashboard-card">
          <p className="scan-status success">Transaction confirmed</p>
          <div className="info-row">
            <span className="info-label">Tx</span>
            <a className="info-value mono" href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
              {txHash.slice(0, 10)}...{txHash.slice(-4)}
            </a>
          </div>
          <div className="info-row">
            <span className="info-label">Amount</span>
            <span className="info-value">{amount} ETH</span>
          </div>
          <button className="btn-primary" onClick={() => setScreen('dashboard')}>Back to dashboard</button>
        </div>
      ) : (
        <>
          <div className="camera-container">
            <img src={`${API_URL}/api/stream`} alt="Camera live" className="camera-feed" />
            <div className="camera-overlay">
              <div className={`camera-reticle ${step === 'signing' ? 'reticle-scanning' : ''}`} />
            </div>
          </div>

          {step === 'form' && (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="send-to">Recipient address</label>
                <input id="send-to" className="form-input" type="text" placeholder="0x..." value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="send-amount">
                  Amount (ETH)
                  <span className="balance-hint"> — available: {parseFloat(String(wallet.balance)).toFixed(4)}</span>
                </label>
                <input id="send-amount" className="form-input" type="number" step="0.0001" placeholder="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <button className="btn-primary" onClick={startIrisScan}>Sign with my iris</button>
              {error && <p className="error-msg">{error}</p>}
              <button className="btn-link" onClick={() => setScreen('dashboard')}>← Back</button>
            </>
          )}

          {step === 'signing' && (
            <>
              <div className="scan-status"><span className="scan-status-dot" /><span>{status}</span></div>
              <p className="scan-hint">Scan is automatic — keep your eye in front of the camera</p>
              <button className="btn-link" onClick={cancelScan}>Cancel</button>
            </>
          )}
        </>
      )}
    </div>
  );
}
