import { useState, useRef } from 'react';
import { useWallet } from '../context/WalletContext';
import {
  sendTransaction,
  getBalance,
  storePK,
  getMultisigDataHash,
  signMessageWithIrisKey,
  executeMultisig,
} from '../services/blockchain';
import { signWithLedger } from '../services/ledger';
import { isWebHIDAvailable, openInTab } from '../utils/openInTab';
import { formatEther, type Address, type Hex } from 'viem';

const API_URL = 'http://localhost:5000';

type Step = 'form' | 'iris-signing' | 'ledger-signing' | 'sending' | 'success';

export default function SendScreen() {
  const { wallet, setWallet, setScreen } = useWallet();
  const [to, setTo] = useState('0x3656Ff4C11C4C8b4b77402fAab8B3387E36f2e77');
  const [amount, setAmount] = useState('0.0001');
  const [step, setStep] = useState<Step>('form');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');
  const [irisSig, setIrisSig] = useState<Hex | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  if (!wallet) return null;

  const isMultisig = wallet.isMultisig && wallet.irisAddress && wallet.ledgerAddress;

  const truncate = (s: string) => s.length <= 14 ? s : `${s.slice(0, 10)}...${s.slice(-4)}`;

  const startIrisScan = () => {
    if (!to.trim() || !to.startsWith('0x')) { setError('Invalid address'); return; }
    if (!parseFloat(amount) || parseFloat(amount) <= 0) { setError('Invalid amount'); return; }

    setError('');
    setStep('iris-signing');
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

        // Restore private key if returned by backend
        const pk = data.wallet?.privateKey;
        const irisAddr = data.wallet?.irisAddress || wallet.irisAddress;
        if (pk && irisAddr) {
          storePK(irisAddr as Address, pk as Hex);
        } else if (pk) {
          storePK(wallet.walletAddress as Address, pk as Hex);
        }

        if (isMultisig) {
          // Sign with iris key, then go to Ledger step
          setStatus('Iris verified — signing...');
          const value = BigInt(Math.floor(parseFloat(amount) * 1e18));
          const msgHash = await getMultisigDataHash(
            wallet.walletAddress as Address,
            to.trim() as Address,
            value,
          );
          // signMessage expects the raw dataHash (before EIP-191 prefix)
          // But getMessageHash returns the already-prefixed hash
          // We need the dataHash for signMessage which will add the prefix
          // Actually, let's compute dataHash ourselves
          const sig = await signMessageWithIrisKey(wallet.irisAddress as Address, msgHash);
          setIrisSig(sig);
          setStep('ledger-signing');
          setStatus('');
        } else {
          // Simple send
          setStep('sending');
          setStatus('Sending transaction...');
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

  const handleLedgerSign = async () => {
    if (!isWebHIDAvailable()) {
      openInTab();
      return;
    }
    setError('');
    setStatus('Waiting for Ledger confirmation...');

    try {
      const value = BigInt(Math.floor(parseFloat(amount) * 1e18));
      const msgHash = await getMultisigDataHash(
        wallet.walletAddress as Address,
        to.trim() as Address,
        value,
      );

      const ledgerSig = await signWithLedger(msgHash);

      setStep('sending');
      setStatus('Sending multisig transaction...');

      const hash = await executeMultisig(
        wallet.walletAddress as Address,
        to.trim() as Address,
        amount,
        irisSig!,
        ledgerSig,
      );

      setTxHash(hash);
      setStep('success');
      const bal = await getBalance(wallet.walletAddress as Address);
      setWallet({ ...wallet, balance: formatEther(bal) });
    } catch (e: any) {
      setError(e.message || 'Ledger signing failed');
      setStep('form');
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
        <h1 className="title">Send ETH</h1>
        <p className="subtitle">
          {step === 'iris-signing' ? 'Iris scan to authorize'
            : step === 'ledger-signing' ? 'Confirm on your Ledger'
            : step === 'sending' ? 'Iris confirmed'
            : step === 'success' ? 'Transaction sent'
            : isMultisig ? 'Requires iris + Ledger signatures' : 'An iris scan is required to sign'}
        </p>
      </div>

      {step === 'ledger-signing' && (
        <>
          <div className="dashboard-card">
            <p className="scan-status success">Iris verified</p>
            <div className="info-row">
              <span className="info-label">To</span>
              <span className="info-value mono">{truncate(to)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Amount</span>
              <span className="info-value">{amount} ETH</span>
            </div>
          </div>
          {status ? (
            <div className="scan-status">
              <span className="spinner" />
              <span className="loading-text">{status}</span>
            </div>
          ) : (
            <>
              <p className="scan-hint">Plug in your Ledger, open the Ethereum app, and confirm.</p>
              <button className="btn-primary" onClick={handleLedgerSign}>
                Sign with Ledger
              </button>
            </>
          )}
          {error && <p className="error-msg">{error}</p>}
          <button className="btn-link" onClick={() => { setStep('form'); setIrisSig(null); }}>Cancel</button>
        </>
      )}

      {step === 'sending' && (
        <div className="dashboard-card">
          <p className="scan-status success">{isMultisig ? 'Both signatures verified' : 'Iris verified'}</p>
          <div className="info-row">
            <span className="info-label">To</span>
            <span className="info-value mono">{truncate(to)}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Amount</span>
            <span className="info-value">{amount} ETH</span>
          </div>
          <div className="scan-status">
            <span className="spinner" />
            <span className="loading-text">{status}</span>
          </div>
        </div>
      )}

      {step === 'success' && (
        <div className="dashboard-card">
          <p className="scan-status success">Transaction confirmed</p>
          <div className="info-row">
            <span className="info-label">Tx</span>
            <a className="info-value mono" href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
              {truncate(txHash)}
            </a>
          </div>
          <div className="info-row">
            <span className="info-label">To</span>
            <span className="info-value mono">{truncate(to)}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Amount</span>
            <span className="info-value">{amount} ETH</span>
          </div>
          <button className="btn-primary" onClick={() => setScreen('dashboard')}>Back to dashboard</button>
        </div>
      )}

      {step === 'iris-signing' && (
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
          <button className="btn-primary" onClick={startIrisScan}>
            {isMultisig ? 'Sign with Iris + Ledger' : 'Sign with my iris'}
          </button>
          {error && <p className="error-msg">{error}</p>}
          <button className="btn-link" onClick={() => setScreen('dashboard')}>← Back</button>
        </>
      )}
    </div>
  );
}
