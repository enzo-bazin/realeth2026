import { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { register } from '../services/api';

export default function RegisterScreen() {
  const { currentHash, setWallet, setScreen } = useWallet();
  const [walletName, setWalletName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    if (!walletName.trim()) {
      setError('Veuillez entrer un nom de wallet');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await register(currentHash, walletName.trim());
      setWallet(result.wallet);
      setScreen('dashboard');
    } catch {
      setError('Erreur lors de la création du wallet');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen">
      <div className="logo-section">
        <h1 className="title">Nouveau Wallet</h1>
        <p className="subtitle">Iris non reconnu — créez votre wallet</p>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="wallet-name">Nom du wallet</label>
        <input
          id="wallet-name"
          className="form-input"
          type="text"
          placeholder="Ex: MonWallet"
          value={walletName}
          onChange={(e) => setWalletName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
        />
      </div>

      <button className="btn-primary" onClick={handleRegister} disabled={loading}>
        {loading ? <span className="spinner" /> : 'Créer mon wallet'}
      </button>

      {error && <p className="error-msg">{error}</p>}

      <button className="btn-link" onClick={() => setScreen('scan')}>
        ← Retour au scan
      </button>
    </div>
  );
}
