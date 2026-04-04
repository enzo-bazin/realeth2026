import { useWallet } from './context/WalletContext';
import ScanScreen from './screens/ScanScreen';
import RegisterScreen from './screens/RegisterScreen';
import DashboardScreen from './screens/DashboardScreen';

export default function App() {
  const { screen, loading } = useWallet();

  if (loading) return <div className="app-container"><p>Chargement...</p></div>;

  return (
    <div className="app-container">
      {screen === 'scan' && <ScanScreen />}
      {screen === 'register' && <RegisterScreen />}
      {screen === 'dashboard' && <DashboardScreen />}
    </div>
  );
}
