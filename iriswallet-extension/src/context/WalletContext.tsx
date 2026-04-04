import { createContext, useContext, useState, type ReactNode } from 'react';

export type Screen = 'scan' | 'register' | 'dashboard';

export interface WalletData {
  irisHash: string;
  walletName: string;
  walletAddress: string;
  balance: number;
  createdAt: string;
}

interface WalletContextType {
  screen: Screen;
  setScreen: (screen: Screen) => void;
  wallet: WalletData | null;
  setWallet: (wallet: WalletData | null) => void;
  currentHash: string;
  setCurrentHash: (hash: string) => void;
  logout: () => void;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>('scan');
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [currentHash, setCurrentHash] = useState('');

  const logout = () => {
    setWallet(null);
    setCurrentHash('');
    setScreen('scan');
  };

  return (
    <WalletContext.Provider
      value={{ screen, setScreen, wallet, setWallet, currentHash, setCurrentHash, logout }}
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
