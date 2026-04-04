import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type Screen = 'scan' | 'register' | 'dashboard' | 'send';

export interface WalletData {
  walletName: string;
  walletAddress: string;
  balance: string;
  createdAt: string;
  onChain: boolean;
  txHash?: string;
  isMultisig?: boolean;
  irisAddress?: string;
  ledgerAddress?: string;
}

interface WalletContextType {
  screen: Screen;
  setScreen: (screen: Screen) => void;
  wallet: WalletData | null;
  setWallet: (wallet: WalletData | null) => void;
  logout: () => void;
  loading: boolean;
}

const STORAGE_KEY = 'iriswallet_session';

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>('scan');
  const [wallet, setWalletState] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setWalletState(JSON.parse(saved));
        setScreen('dashboard');
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const setWallet = (data: WalletData | null) => {
    setWalletState(data);
    if (data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const logout = () => {
    setWallet(null);
    setScreen('scan');
  };

  return (
    <WalletContext.Provider value={{ screen, setScreen, wallet, setWallet, logout, loading }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
