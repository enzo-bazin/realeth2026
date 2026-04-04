import { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { register } from '../services/api';
import { createWallet, registerOnChain, getBalance } from '../services/blockchain';
import { formatEther } from 'viem';

export default function RegisterScreen() {
  const { setWallet, setScreen } = useWallet();
  const [walletName, setWalletName] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const handleRegister = async () => {
    if (!walletName.trim()) {
      setError('Please enter a wallet name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { address } = createWallet();

      setStatus('Registering iris...');
      const backendResult = await register(walletName.trim(), address);
      const irisHash = backendResult.wallet?.irisHash || '';

      setStatus('Registering on-chain...');
      const txHash = await registerOnChain(address, irisHash);

      const bal = await getBalance(address);

      setWallet({
        walletName: walletName.trim(),
        walletAddress: address,
        balance: formatEther(bal),
        createdAt: new Date().toISOString(),
        onChain: true,
        txHash,
      });
      setScreen('dashboard');
    } catch (e: any) {
      setError(e.message || 'Error creating wallet');
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  return (
    <div className="screen">
      <div className="logo-section">
        <h1 className="title">New Wallet</h1>
        <p className="subtitle">Iris detected — creating on-chain wallet</p>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="wallet-name">Wallet name</label>
        <input
          id="wallet-name"
          className="form-input"
          type="text"
          placeholder="e.g. MyWallet"
          value={walletName}
          onChange={(e) => setWalletName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
        />
      </div>

      <button className="btn-primary" onClick={handleRegister} disabled={loading}>
        {loading ? (
          <>
            <span className="spinner" />
            <span className="loading-text">{status}</span>
          </>
        ) : (
          'Create my on-chain wallet'
        )}
      </button>

      {error && <p className="error-msg">{error}</p>}

      <button className="btn-link" onClick={() => setScreen('scan')}>
        ← Back to scan
      </button>
    </div>
  );
}
