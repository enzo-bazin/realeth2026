import { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { register } from '../services/api';
import { registerOnChain, getBalance } from '../services/blockchain';
import { formatEther } from 'viem';

export default function RegisterScreen() {
  const { currentHash, setWallet, setScreen } = useWallet();
  const [walletName, setWalletName] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const handleRegister = async () => {
    if (!walletName.trim()) {
      setError('Veuillez entrer un nom de wallet');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Register in backend (stores iris template)
      setStatus('Enregistrement iris...');
      const backendResult = await register(walletName.trim());

      // 2. Register on-chain
      setStatus('Enregistrement on-chain...');
      const { walletAddress, txHash } = await registerOnChain(currentHash);

      // 3. Get balance
      const bal = await getBalance(walletAddress);

      setWallet({
        irisHash: currentHash,
        walletName: walletName.trim(),
        walletAddress,
        balance: formatEther(bal),
        createdAt: new Date().toISOString(),
        onChain: true,
        txHash,
      });
      setScreen('dashboard');
    } catch (e: any) {
      // If on-chain fails, fallback to backend-only
      if (e.message?.includes('insufficient funds') || e.message?.includes('gas')) {
        setError('Pas assez de ETH sur World Chain Sepolia pour le gas. Enregistrement off-chain uniquement.');
        try {
          const backendResult = await register(walletName.trim());
          setWallet({ ...backendResult.wallet, onChain: false });
          setScreen('dashboard');
        } catch {
          setError('Erreur lors de la creation du wallet');
        }
      } else {
        setError(e.message || 'Erreur lors de la creation du wallet');
      }
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  return (
    <div className="screen">
      <div className="logo-section">
        <h1 className="title">Nouveau Wallet</h1>
        <p className="subtitle">Iris detecte — creation du wallet on-chain</p>
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

      {currentHash && (
        <p className="iris-hash-display">
          Iris: {currentHash.slice(0, 8)}...{currentHash.slice(-4)}
        </p>
      )}

      <button className="btn-primary" onClick={handleRegister} disabled={loading}>
        {loading ? (
          <>
            <span className="spinner" />
            <span className="loading-text">{status}</span>
          </>
        ) : (
          'Creer mon wallet on-chain'
        )}
      </button>

      {error && <p className="error-msg">{error}</p>}

      <button className="btn-link" onClick={() => setScreen('scan')}>
        ← Retour au scan
      </button>
    </div>
  );
}
