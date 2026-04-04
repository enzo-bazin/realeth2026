import { useState, useRef, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { getUnlinkAddress, getUnlinkBalances, privateTransfer, requestFaucet, TEST_TOKEN } from '../services/unlink';
import { type Address } from 'viem';

const API_URL = 'http://localhost:5000';

type Step = 'form' | 'signing' | 'sending' | 'success';

export default function PrivateSendScreen() {
  const { wallet, setScreen } = useWallet();
  const [recipientUnlink, setRecipientUnlink] = useState('');
  const [amount, setAmount] = useState('1000000000000000000');
  const [step, setStep] = useState<Step>('form');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [txId, setTxId] = useState('');
  const [myUnlinkAddr, setMyUnlinkAddr] = useState('');
  const [balance, setBalance] = useState<string | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  if (!wallet) return null;

  const truncate = (s: string) => s.length <= 16 ? s : `${s.slice(0, 12)}...${s.slice(-4)}`;

  const refreshBalance = async () => {
    try {
      const bal = await getUnlinkBalances(wallet.walletAddress as Address);
      const tokenBal = bal?.balances?.find((b: any) => b.token?.toLowerCase() === TEST_TOKEN.toLowerCase());
      setBalance(tokenBal ? (Number(tokenBal.amount) / 1e18).toFixed(4) : '0');
    } catch { setBalance('0'); }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingInfo(true);
      try {
        const addr = await getUnlinkAddress(wallet.walletAddress as Address);
        if (!cancelled) setMyUnlinkAddr(addr);
        await refreshBalance();
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to connect to Unlink');
      } finally {
        if (!cancelled) setLoadingInfo(false);
      }
    })();
    return () => { cancelled = true; };
  }, [wallet.walletAddress]);

  const startIrisScan = () => {
    if (!recipientUnlink.trim() || !recipientUnlink.startsWith('unlink1')) {
      setError('Invalid Unlink address (must start with unlink1...)');
      return;
    }
    if (!amount || BigInt(amount) <= 0n) {
      setError('Invalid amount');
      return;
    }

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

        setStep('sending');
        try {
          const result = await privateTransfer(
            wallet.walletAddress as Address,
            recipientUnlink.trim(),
            amount,
            setStatus,
          );
          setTxId(result?.txId || 'confirmed');
          await refreshBalance();
          setStep('success');
        } catch (e: any) {
          setError(e.message || 'Private transfer failed');
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

  const handleFaucet = async () => {
    setError('');
    setStatus('Requesting test tokens...');
    try {
      await requestFaucet(wallet.walletAddress as Address);
      setStatus('Tokens received! Updating balance...');
      // Wait a few seconds for the private transfer to settle
      setTimeout(async () => {
        await refreshBalance();
        setStatus('');
      }, 5000);
    } catch (e: any) {
      setError(e.message || 'Faucet error');
      setStatus('');
    }
  };

  const cancelScan = () => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    fetch(`${API_URL}/api/autoscan/stop`, { method: 'POST' }).catch(() => {});
    setStep('form');
  };

  return (
    <div className="screen">
      <div className="logo-section">
        <h1 className="title">Private Send</h1>
        <p className="subtitle">
          {step === 'signing' ? 'Iris scan to authorize'
            : step === 'sending' ? 'Iris verified'
            : step === 'success' ? 'Transfer sent'
            : 'Via Unlink — ZK private transfer'}
        </p>
      </div>

      {step === 'success' && (
        <div className="dashboard-card">
          <p className="scan-status success">Private transfer confirmed</p>
          <div className="info-row">
            <span className="info-label">Status</span>
            <span className="info-value" style={{ color: '#10b981' }}>Private — untraceable</span>
          </div>
          {balance && (
            <div className="info-row">
              <span className="info-label">Remaining balance</span>
              <span className="info-value">{balance} tokens</span>
            </div>
          )}
          <button className="btn-primary" onClick={() => setScreen('dashboard')}>Back to dashboard</button>
        </div>
      )}

      {step === 'sending' && (
        <div className="dashboard-card">
          <p className="scan-status success">Iris verified</p>
          <div className="info-row">
            <span className="info-label">To</span>
            <span className="info-value mono">{truncate(recipientUnlink)}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Amount</span>
            <span className="info-value">{(Number(amount) / 1e18).toFixed(4)} tokens</span>
          </div>
          <div className="scan-status">
            <span className="spinner" />
            <span className="loading-text">{status}</span>
          </div>
        </div>
      )}

      {step === 'signing' && (
        <>
          <div className="camera-container">
            <img src={`${API_URL}/api/stream`} alt="Camera live" className="camera-feed" />
            <div className="camera-overlay">
              <div className="camera-reticle reticle-scanning" />
            </div>
          </div>
          <div className="scan-status"><span className="scan-status-dot" /><span>{status}</span></div>
          <p className="scan-hint">Scan is automatic — keep your eye in front of the camera</p>
          <button className="btn-link" onClick={cancelScan}>Cancel</button>
        </>
      )}

      {step === 'form' && (
        <>
          {loadingInfo ? (
            <div className="scan-status"><span className="spinner" /><span>Connecting to Unlink...</span></div>
          ) : (
            <>
              {myUnlinkAddr && (
                <div className="unlink-info">
                  <div className="unlink-info-row">
                    <span className="info-label">Your private address</span>
                    <span className="info-value mono small">{truncate(myUnlinkAddr)}</span>
                  </div>
                  <div className="unlink-info-row">
                    <span className="info-label">Private balance</span>
                    <span className="info-value">
                      <span className={balance !== '0' ? 'unlink-balance-has' : ''}>{balance ?? '0'} tokens</span>
                      <button className="btn-refresh" onClick={refreshBalance} title="Refresh">↻</button>
                    </span>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="priv-to">Recipient Unlink address</label>
                <input id="priv-to" className="form-input" type="text" placeholder="unlink1..." value={recipientUnlink} onChange={(e) => setRecipientUnlink(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="priv-amount">
                  Amount (wei)
                  {balance && <span className="balance-hint"> — available: {balance} tokens</span>}
                </label>
                <input id="priv-amount" className="form-input" type="text" placeholder="1000000000000000000" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>

              <button className="btn-private" onClick={startIrisScan}>Sign privately with my iris</button>

              <button className="btn-link" onClick={handleFaucet}>
                {status || 'Get test tokens (faucet)'}
              </button>

              {error && <p className="error-msg">{error}</p>}
              <button className="btn-link" onClick={() => setScreen('dashboard')}>← Back</button>
            </>
          )}
        </>
      )}
    </div>
  );
}
