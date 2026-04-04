import { useEffect, useState, useRef } from 'react';
import { useWallet } from '../context/WalletContext';

const API_URL = 'http://localhost:5000';

export default function ScanScreen() {
  const { setScreen, setWallet, setCurrentHash } = useWallet();
  const [status, setStatus] = useState('Recherche de votre oeil...');
  const [error, setError] = useState('');
  const [unknownHash, setUnknownHash] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);

  const startAutoScan = () => {
    // Reset state
    setError('');
    setUnknownHash('');
    setStatus('Recherche de votre oeil...');

    // Fermer l'ancienne connexion si elle existe
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      fetch(`${API_URL}/api/autoscan/stop`, { method: 'POST' }).catch(() => {});
    }

    const es = new EventSource(`${API_URL}/api/autoscan`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.status === 'scanning') {
          setStatus('Recherche de votre oeil...');
          return;
        }

        es.close();
        eventSourceRef.current = null;

        if (data.status === 'found') {
          setWallet(data.wallet);
          setScreen('dashboard');
        } else if (data.status === 'unknown') {
          setCurrentHash(data.irisHash);
          setUnknownHash(data.irisHash);
          setStatus('Iris non reconnu');
        }
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      setError('Connexion au serveur perdue');
      es.close();
      eventSourceRef.current = null;
    };
  };

  useEffect(() => {
    startAutoScan();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      fetch(`${API_URL}/api/autoscan/stop`, { method: 'POST' }).catch(() => {});
    };
  }, []);

  const handleRetry = () => {
    setUnknownHash('');
    startAutoScan();
  };

  return (
    <div className="screen">
      <div className="logo-section compact">
        <h1 className="title">IrisWallet</h1>
        <p className="subtitle">Authentification biometrique</p>
      </div>

      <div className="camera-container">
        <img
          src={`${API_URL}/api/stream`}
          alt="Camera live"
          className="camera-feed"
        />
        <div className="camera-overlay">
          <div className={`camera-reticle ${unknownHash ? 'reticle-warning' : ''}`} />
        </div>
      </div>

      {error ? (
        <p className="error-msg">{error}</p>
      ) : unknownHash ? (
        <>
          <p className="scan-status warning">
            Iris non reconnu — aucun compte associe
          </p>
          <button className="btn-primary" onClick={() => setScreen('register')}>
            Creer un compte
          </button>
          <button className="btn-link" onClick={handleRetry}>
            Reessayer le scan
          </button>
        </>
      ) : (
        <>
          <div className="scan-status">
            <span className="scan-status-dot" />
            <span>{status}</span>
          </div>
          <p className="scan-hint">
            Placez votre oeil devant la camera, le scan est automatique
          </p>
        </>
      )}
    </div>
  );
}
