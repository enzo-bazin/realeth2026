import { useEffect, useState, useRef } from 'react';
import { useWallet } from '../context/WalletContext';
import { getBalance, storePK } from '../services/blockchain';
import { formatEther, type Address, type Hex } from 'viem';

const API_URL = 'http://localhost:5000';

export default function ScanScreen() {
  const { setScreen, setWallet } = useWallet();
  const [status, setStatus] = useState('Looking for your eye...');
  const [error, setError] = useState('');
  const [unknown, setUnknown] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startAutoScan = () => {
    setError('');
    setUnknown(false);
    setStatus('Looking for your eye...');

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      fetch(`${API_URL}/api/autoscan/stop`, { method: 'POST' }).catch(() => {});
    }

    const es = new EventSource(`${API_URL}/api/autoscan`);
    eventSourceRef.current = es;

    es.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.status === 'scanning') {
          setStatus('Scanning your iris...');
          return;
        }

        es.close();
        eventSourceRef.current = null;

        if (data.status === 'found') {
          const address = data.wallet?.address || data.wallet?.walletAddress;
          const name = data.wallet?.walletName || 'IrisWallet';
          const created = data.wallet?.createdAt || new Date().toISOString();

          // Restore private key from backend
          const pk = data.wallet?.privateKey;
          const irisAddr = data.wallet?.irisAddress;
          if (pk && irisAddr) {
            storePK(irisAddr as Address, pk as Hex);
          } else if (pk) {
            storePK(address as Address, pk as Hex);
          }

          let balance = '0';
          try {
            const bal = await getBalance(address as Address);
            balance = formatEther(bal);
          } catch { /* ignore */ }

          setWallet({
            walletName: name,
            walletAddress: address,
            balance,
            createdAt: created,
            onChain: true,
            isMultisig: !!data.wallet?.ledgerAddress,
            irisAddress: data.wallet?.irisAddress,
            ledgerAddress: data.wallet?.ledgerAddress,
          });
          setScreen('dashboard');
        } else if (data.status === 'unknown') {
          setUnknown(true);
          setStatus('Iris not recognized');
        }
      } catch { /* ignore */ }
    };

    es.onerror = () => {
      setError('Connection to server lost');
      es.close();
      eventSourceRef.current = null;
    };
  };

  useEffect(() => {
    startAutoScan();
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      fetch(`${API_URL}/api/autoscan/stop`, { method: 'POST' }).catch(() => {});
    };
  }, []);

  return (
    <div className="screen">
      <div className="logo-section compact">
        <h1 className="title">IrisWallet</h1>
        <p className="subtitle">On-chain biometric authentication</p>
      </div>

      <div className="camera-container">
        <img src={`${API_URL}/api/stream`} alt="Camera live" className="camera-feed" />
        <div className="camera-overlay">
          <div className={`camera-reticle ${unknown ? 'reticle-warning' : ''}`} />
        </div>
      </div>

      {error ? (
        <p className="error-msg">{error}</p>
      ) : unknown ? (
        <>
          <p className="scan-status warning">Iris not recognized — no account found</p>
          <button className="btn-primary" onClick={() => setScreen('register')}>Create an account</button>
          <button className="btn-link" onClick={() => { setUnknown(false); startAutoScan(); }}>Retry scan</button>
        </>
      ) : (
        <>
          <div className="scan-status">
            <span className="scan-status-dot" />
            <span>{status}</span>
          </div>
          <p className="scan-hint">Place your eye in front of the camera, scan is automatic</p>
        </>
      )}
    </div>
  );
}
