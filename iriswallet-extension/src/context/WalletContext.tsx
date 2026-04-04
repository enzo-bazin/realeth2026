import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type Screen = 'scan' | 'register' | 'dashboard';

export interface WalletData {
  irisHash: string;
  walletName: string;
  walletAddress: string;
  balance: string;
  createdAt: string;
  onChain: boolean;
  txHash?: string;
}

interface WalletContextType {
  screen: Screen;
  setScreen: (screen: Screen) => void;
  wallet: WalletData | null;
  setWallet: (wallet: WalletData | null) => void;
  currentHash: string;
  setCurrentHash: (hash: string) => void;
  logout: () => void;
  loading: boolean;
}

const STORAGE_KEY = 'iriswallet_session';

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>('scan');
  const [wallet, setWalletState] = useState<WalletData | null>(null);
  const [currentHash, setCurrentHash] = useState('');
  const [loading, setLoading] = useState(true);

  // Load session on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved) as WalletData;
        setWalletState(data);
        setScreen('dashboard');
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  // Persist wallet to localStorage
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
    setCurrentHash('');
    setScreen('scan');
  };

  return (
    <WalletContext.Provider
      value={{ screen, setScreen, wallet, setWallet, currentHash, setCurrentHash, logout, loading }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
