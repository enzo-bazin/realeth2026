import { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { scanIris } from '../mock/irisMock';
import { authenticate } from '../services/api';

export default function ScanScreen() {
  const { setScreen, setWallet, setCurrentHash } = useWallet();
  const [mode, setMode] = useState<'known' | 'new'>('known');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleScan = async () => {
    setLoading(true);
    setError('');
    try {
      const hash = scanIris(mode);
      setCurrentHash(hash);
      const result = await authenticate(hash);

      if (result.found) {
        setWallet(result.wallet);
        setScreen('dashboard');
      } else {
        setScreen('register');
      }
    } catch {
      setError('Impossible de contacter le serveur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen">
      <div className="logo-section">
        <div className="iris-icon">
          <svg viewBox="0 0 100 100" width="80" height="80">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#00d4ff" strokeWidth="2" />
            <circle cx="50" cy="50" r="30" fill="none" stroke="#00d4ff" strokeWidth="1.5" opacity="0.7" />
            <circle cx="50" cy="50" r="15" fill="none" stroke="#00d4ff" strokeWidth="1" opacity="0.5" />
            <circle cx="50" cy="50" r="8" fill="#00d4ff" opacity="0.3" />
            <circle cx="50" cy="50" r="4" fill="#00d4ff" />
          </svg>
        </div>
        <h1 className="title">IrisWallet</h1>
        <p className="subtitle">Authentification biométrique</p>
      </div>

      <div className="toggle-group">
        <span className="toggle-label">Mode test :</span>
        <button
          className={`toggle-btn ${mode === 'known' ? 'active' : ''}`}
          onClick={() => setMode('known')}
        >
          Hash connu
        </button>
        <button
          className={`toggle-btn ${mode === 'new' ? 'active' : ''}`}
          onClick={() => setMode('new')}
        >
          Hash nouveau
        </button>
      </div>

      <button className="btn-primary" onClick={handleScan} disabled={loading}>
        {loading ? (
          <span className="spinner" />
        ) : (
          <>
            <span className="btn-icon">👁</span>
            Scanner mon iris
          </>
        )}
      </button>

      {error && <p className="error-msg">{error}</p>}
    </div>
  );
}
