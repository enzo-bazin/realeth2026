import { useEffect, useState, useRef } from 'react';
import { useWallet } from '../context/WalletContext';

const API_URL = 'http://localhost:5000';

export default function ScanScreen() {
  const { setScreen, setWallet, setCurrentHash } = useWallet();
  const [status, setStatus] = useState('Recherche de votre oeil...');
  const [error, setError] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Connecter l'auto-scan SSE au montage
    const es = new EventSource(`${API_URL}/api/autoscan`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.status === 'scanning') {
          setStatus('Recherche de votre oeil...');
          return;
        }

        // Resultat recu — fermer la connexion
        es.close();

        if (data.status === 'found') {
          setWallet(data.wallet);
          setScreen('dashboard');
        } else if (data.status === 'unknown') {
          setCurrentHash(data.irisHash);
          setScreen('register');
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setError('Connexion au serveur perdue');
      es.close();
    };

    return () => {
      es.close();
      // Notifier le backend d'arreter
      fetch(`${API_URL}/api/autoscan/stop`, { method: 'POST' }).catch(() => {});
    };
  }, [setScreen, setWallet, setCurrentHash]);

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
          <div className="camera-reticle" />
        </div>
      </div>

      <div className="scan-status">
        <span className="scan-status-dot" />
        <span>{status}</span>
      </div>

      {error ? (
        <p className="error-msg">{error}</p>
      ) : (
        <p className="scan-hint">
          Placez votre oeil devant la camera, le scan est automatique
        </p>
      )}
    </div>
  );
}
