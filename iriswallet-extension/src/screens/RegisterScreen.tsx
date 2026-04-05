import { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { register } from '../services/api';
import { createWallet, registerOnChain, getBalance, deployMultisig } from '../services/blockchain';
import { requestLedgerAddress, pollLedgerResult, clearLedgerPending } from '../services/ledger';
import { formatEther, type Address } from 'viem';

type Step = 'name' | 'multisig-choice' | 'ledger-pair' | 'creating';

const REGISTER_STATE_KEY = 'iriswallet_register_state';

export default function RegisterScreen() {
  const { setWallet, setScreen } = useWallet();
  const [walletName, setWalletName] = useState('');
  const [step, setStep] = useState<Step>('name');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [useMultisig, setUseMultisig] = useState(false);
  const [ledgerAddr, setLedgerAddr] = useState('');

  // On mount: if there's a pending register state, poll backend for result
  useEffect(() => {
    const saved = localStorage.getItem(REGISTER_STATE_KEY);
    if (!saved) return;

    const state = JSON.parse(saved);
    setWalletName(state.walletName || '');
    setUseMultisig(true);
    setStep('ledger-pair');
    setStatus('Waiting for Ledger connection...');

    const interval = setInterval(async () => {
      const result = await pollLedgerResult();
      if (result) {
        clearInterval(interval);
        if (result.address) {
          setLedgerAddr(result.address);
          setStatus('');
          localStorage.removeItem(REGISTER_STATE_KEY);
        } else if (result.error) {
          setError(result.error);
          setStatus('');
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleNameSubmit = () => {
    if (!walletName.trim()) {
      setError('Please enter a wallet name');
      return;
    }
    setError('');
    setStep('multisig-choice');
  };

  const handleMultisigChoice = (wantMultisig: boolean) => {
    setUseMultisig(wantMultisig);
    if (wantMultisig) {
      setStep('ledger-pair');
    } else {
      handleCreate(false, '');
    }
  };

  const handleConnectLedger = () => {
    setError('');
    setStatus('Waiting for Ledger connection...');
    requestLedgerAddress(walletName.trim());
  };

  const handleConfirmLedger = () => {
    localStorage.removeItem(REGISTER_STATE_KEY);
    clearLedgerPending();
    handleCreate(true, ledgerAddr);
  };

  const handleCreate = async (multisig: boolean, ledgerAddress: string) => {
    setStep('creating');
    setLoading(true);
    setError('');

    try {
      const { address: irisAddress, privateKey } = createWallet();

      if (multisig) {
        setStatus('Deploying multisig wallet...');
        const { contractAddress } = await deployMultisig(irisAddress, ledgerAddress as Address);

        setStatus('Registering iris...');
        const backendResult = await register(walletName.trim(), contractAddress, privateKey, irisAddress, ledgerAddress);
        const irisHash = backendResult.wallet?.irisHash || '';

        setStatus('Registering on-chain...');
        const txHash = await registerOnChain(contractAddress, irisHash);
        const bal = await getBalance(contractAddress);

        setWallet({
          walletName: walletName.trim(), walletAddress: contractAddress,
          balance: formatEther(bal), createdAt: new Date().toISOString(),
          onChain: true, txHash, isMultisig: true, irisAddress, ledgerAddress,
        });
      } else {
        setStatus('Registering iris...');
        const backendResult = await register(walletName.trim(), irisAddress, privateKey);
        const irisHash = backendResult.wallet?.irisHash || '';

        setStatus('Registering on-chain...');
        const txHash = await registerOnChain(irisAddress, irisHash);
        const bal = await getBalance(irisAddress);

        setWallet({
          walletName: walletName.trim(), walletAddress: irisAddress,
          balance: formatEther(bal), createdAt: new Date().toISOString(),
          onChain: true, txHash,
        });
      }
      setScreen('dashboard');
    } catch (e: any) {
      setError(e.message || 'Error creating wallet');
      setStep('name');
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  return (
    <div className="screen">
      <div className="logo-section">
        <h1 className="title">New Wallet</h1>
        <p className="subtitle">
          {step === 'name' && 'Iris detected — creating on-chain wallet'}
          {step === 'multisig-choice' && 'Choose your security level'}
          {step === 'ledger-pair' && 'Connect your Ledger'}
          {step === 'creating' && 'Setting up your wallet...'}
        </p>
      </div>

      {step === 'name' && (
        <>
          <div className="form-group">
            <label className="form-label" htmlFor="wallet-name">Wallet name</label>
            <input id="wallet-name" className="form-input" type="text" placeholder="e.g. MyWallet"
              value={walletName} onChange={(e) => setWalletName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()} />
          </div>
          <button className="btn-primary" onClick={handleNameSubmit}>Continue</button>
        </>
      )}

      {step === 'multisig-choice' && (
        <>
          <div className="dashboard-card">
            <p className="scan-status">Do you want to add Ledger multisig?</p>
            <p className="scan-hint">Multisig requires both your iris and a Ledger hardware wallet to sign every transaction (2-of-2 security).</p>
          </div>
          <button className="btn-primary" onClick={() => handleMultisigChoice(true)}>Yes, use Iris + Ledger</button>
          <button className="btn-link" onClick={() => handleMultisigChoice(false)}>No, iris only</button>
        </>
      )}

      {step === 'ledger-pair' && (
        <>
          {ledgerAddr ? (
            <>
              <div className="dashboard-card">
                <p className="scan-status success">Ledger connected</p>
                <div className="info-row">
                  <span className="info-label">Address</span>
                  <span className="info-value mono">{ledgerAddr.slice(0, 10)}...{ledgerAddr.slice(-4)}</span>
                </div>
              </div>
              <button className="btn-primary" onClick={handleConfirmLedger}>Create multisig wallet</button>
            </>
          ) : (
            <>
              <div className="dashboard-card">
                <p className="scan-hint">Click below to open the Ledger page. Connect your Ledger there, then come back here.</p>
              </div>
              {status && (
                <div className="scan-status">
                  <span className="scan-status-dot" />
                  <span>{status}</span>
                </div>
              )}
              <button className="btn-primary" onClick={handleConnectLedger}>Connect Ledger</button>
            </>
          )}
          {error && <p className="error-msg">{error}</p>}
          <button className="btn-link" onClick={() => { setStep('multisig-choice'); setLedgerAddr(''); clearLedgerPending(); localStorage.removeItem(REGISTER_STATE_KEY); }}>← Back</button>
        </>
      )}

      {step === 'creating' && (
        <div className="dashboard-card">
          <span className="spinner" /><span className="loading-text">{status}</span>
        </div>
      )}

      {error && step !== 'ledger-pair' && <p className="error-msg">{error}</p>}
      {step === 'name' && <button className="btn-link" onClick={() => setScreen('scan')}>← Back to scan</button>}
    </div>
  );
}
