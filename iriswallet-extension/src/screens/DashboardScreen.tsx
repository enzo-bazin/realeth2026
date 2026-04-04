import { useWallet } from '../context/WalletContext';

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function DashboardScreen() {
  const { wallet, logout } = useWallet();

  if (!wallet) return null;

  return (
    <div className="screen">
      <div className="logo-section">
        <h1 className="title">{wallet.walletName}</h1>
        <p className="subtitle">Wallet connecté</p>
      </div>

      <div className="dashboard-card">
        <div className="balance-section">
          <span className="balance-label">Solde</span>
          <span className="balance-value">{wallet.balance.toFixed(2)} ETH</span>
        </div>

        <div className="info-row">
          <span className="info-label">Adresse</span>
          <span className="info-value mono">{truncateAddress(wallet.walletAddress)}</span>
        </div>

        <div className="info-row">
          <span className="info-label">Créé le</span>
          <span className="info-value">
            {new Date(wallet.createdAt).toLocaleDateString('fr-FR')}
          </span>
        </div>
      </div>

      <button className="btn-danger" onClick={logout}>
        Déconnexion
      </button>
    </div>
  );
}
