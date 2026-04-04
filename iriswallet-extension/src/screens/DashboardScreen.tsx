import { useEffect, useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { getBalance } from '../services/blockchain';
import { formatEther, type Address } from 'viem';

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function DashboardScreen() {
  const { wallet, setWallet, logout } = useWallet();
  const [refreshing, setRefreshing] = useState(false);

  const refreshBalance = async () => {
    if (!wallet) return;
    setRefreshing(true);
    try {
      const bal = await getBalance(wallet.walletAddress as Address);
      setWallet({ ...wallet, balance: formatEther(bal) });
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  };

  // Auto-refresh balance on mount and every 10s
  useEffect(() => {
    refreshBalance();
    const interval = setInterval(refreshBalance, 10000);
    return () => clearInterval(interval);
  }, [wallet?.walletAddress]);

  if (!wallet) return null;

  const explorerUrl = `https://sepolia.etherscan.io/address/${wallet.walletAddress}`;

  return (
    <div className="screen">
      <div className="logo-section">
        <h1 className="title">{wallet.walletName}</h1>
        <p className="subtitle">
          {wallet.onChain ? 'Wallet on-chain' : 'Wallet off-chain'}
          {wallet.onChain && <span className="chain-badge">Sepolia</span>}
        </p>
      </div>

      <div className="dashboard-card">
        <div className="balance-section">
          <span className="balance-label">Solde</span>
          <span className="balance-value">
            {parseFloat(String(wallet.balance)).toFixed(4)} ETH
            {refreshing && <span className="spinner-small" />}
          </span>
        </div>

        <div className="info-row">
          <span className="info-label">Adresse</span>
          <a
            className="info-value mono"
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {truncateAddress(wallet.walletAddress)}
          </a>
        </div>

        <div className="info-row">
          <span className="info-label">Cree le</span>
          <span className="info-value">
            {new Date(wallet.createdAt).toLocaleDateString('fr-FR')}
          </span>
        </div>

        {wallet.txHash && (
          <div className="info-row">
            <span className="info-label">Tx</span>
            <a
              className="info-value mono"
              href={`https://sepolia.etherscan.io/tx/${wallet.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {truncateAddress(wallet.txHash)}
            </a>
          </div>
        )}
      </div>

      <button className="btn-danger" onClick={logout}>
        Deconnexion
      </button>
    </div>
  );
}
