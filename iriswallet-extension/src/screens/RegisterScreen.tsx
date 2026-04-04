import { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { register } from '../services/api';
import { createWallet, registerOnChain, getBalance, deployMultisig } from '../services/blockchain';
import { getLedgerAddress } from '../services/ledger';
import { isWebHIDAvailable, openInTab } from '../utils/openInTab';
import { formatEther, type Address } from 'viem';

type Step = 'name' | 'multisig-choice' | 'ledger-pair' | 'creating';

export default function RegisterScreen() {
  const { setWallet, setScreen } = useWallet();
  const [walletName, setWalletName] = useState('');
  const [step, setStep] = useState<Step>('name');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [useMultisig, setUseMultisig] = useState(false);
  const [ledgerAddr, setLedgerAddr] = useState('');

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
      if (!isWebHIDAvailable()) {
        openInTab();
        return;
      }
      setStep('ledger-pair');
    } else {
      handleCreate(false, '');
    }
  };

  const handleConnectLedger = async () => {
    setLoading(true);
    setError('');
    try {
      const addr = await getLedgerAddress();
      setLedgerAddr(addr);
      setLoading(false);
    } catch (e: any) {
      setError(e.message || 'Failed to connect Ledger');
      setLoading(false);
    }
  };

  const handleConfirmLedger = () => {
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
        const { contractAddress, txHash: deployTxHash } = await deployMultisig(
          irisAddress,
          ledgerAddress as Address,
        );

        setStatus('Registering iris...');
        const backendResult = await register(
          walletName.trim(),
          contractAddress,
          privateKey,
          irisAddress,
          ledgerAddress,
        );
        const irisHash = backendResult.wallet?.irisHash || '';

        setStatus('Registering on-chain...');
        const txHash = await registerOnChain(contractAddress, irisHash);

        const bal = await getBalance(contractAddress);

        setWallet({
          walletName: walletName.trim(),
          walletAddress: contractAddress,
          balance: formatEther(bal),
          createdAt: new Date().toISOString(),
          onChain: true,
          txHash,
          isMultisig: true,
          irisAddress,
          ledgerAddress,
        });
      } else {
        setStatus('Registering iris...');
        const backendResult = await register(walletName.trim(), irisAddress, privateKey);
        const irisHash = backendResult.wallet?.irisHash || '';

        setStatus('Registering on-chain...');
        const txHash = await registerOnChain(irisAddress, irisHash);

        const bal = await getBalance(irisAddress);

        setWallet({
          walletName: walletName.trim(),
          walletAddress: irisAddress,
          balance: formatEther(bal),
          createdAt: new Date().toISOString(),
          onChain: true,
          txHash,
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
            <input
              id="wallet-name"
              className="form-input"
              type="text"
              placeholder="e.g. MyWallet"
              value={walletName}
              onChange={(e) => setWalletName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
            />
          </div>
          <button className="btn-primary" onClick={handleNameSubmit}>
            Continue
          </button>
        </>
      )}

      {step === 'multisig-choice' && (
        <>
          <div className="dashboard-card">
            <p className="scan-status">Do you want to add Ledger multisig?</p>
            <p className="scan-hint">
              Multisig requires both your iris and a Ledger hardware wallet to sign every transaction (2-of-2 security).
            </p>
          </div>
          <button className="btn-primary" onClick={() => handleMultisigChoice(true)}>
            Yes, use Iris + Ledger
          </button>
          <button className="btn-link" onClick={() => handleMultisigChoice(false)}>
            No, iris only
          </button>
        </>
      )}

      {step === 'ledger-pair' && (
        <>
          {!ledgerAddr ? (
            <>
              <div className="dashboard-card">
                <p className="scan-hint">
                  Plug in your Ledger, unlock it, and open the Ethereum app.
                </p>
              </div>
              <button className="btn-primary" onClick={handleConnectLedger} disabled={loading}>
                {loading ? (
                  <><span className="spinner" /><span className="loading-text">Connecting...</span></>
                ) : (
                  'Connect Ledger'
                )}
              </button>
            </>
          ) : (
            <>
              <div className="dashboard-card">
                <p className="scan-status success">Ledger connected</p>
                <div className="info-row">
                  <span className="info-label">Address</span>
                  <span className="info-value mono">
                    {ledgerAddr.slice(0, 10)}...{ledgerAddr.slice(-4)}
                  </span>
                </div>
              </div>
              <button className="btn-primary" onClick={handleConfirmLedger}>
                Create multisig wallet
              </button>
            </>
          )}
          <button className="btn-link" onClick={() => { setStep('multisig-choice'); setLedgerAddr(''); }}>
            ← Back
          </button>
        </>
      )}

      {step === 'creating' && (
        <div className="dashboard-card">
          <span className="spinner" />
          <span className="loading-text">{status}</span>
        </div>
      )}

      {error && <p className="error-msg">{error}</p>}

      {step === 'name' && (
        <button className="btn-link" onClick={() => setScreen('scan')}>
          ← Back to scan
        </button>
      )}
    </div>
  );
}
