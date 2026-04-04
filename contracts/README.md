# IrisWallet — Smart Contracts

Iris-authenticated blockchain wallet smart contracts with Chainlink CRE integration.

## Deployed Contracts (Ethereum Sepolia — Chain ID 11155111)

| Contract | Address |
|----------|---------|
| IrisRegistry | `0xc48326f0031DeCbd53CF97835382C638E83f2785` |
| IrisVerifier | `0x8a5F9475e329375fbE17a2766c43c9EFd165C645` |

## Architecture

```
IrisRegistry              IrisVerifier
(iris hash <-> wallet)  <---  (iris match oracle + CRE)
      |                            |
  1 iris = 1 wallet          Chainlink CRE (TEE)
                                   |
                           KeystoneForwarder
                                   |
                          onReport(metadata, report)
```

### Verification Paths

IrisVerifier supports two ingestion paths for match results:

1. **Direct oracle** (`submitMatchResult`) — Legacy path where a trusted oracle address calls the contract directly. Used for testing and fallback.

2. **Chainlink CRE** (`onReport`) — The KeystoneForwarder delivers a signed report from the CRE workflow. The iris matching runs in a TEE (Trusted Execution Environment) — biometric data never leaves the enclave. Only a boolean (match/no-match) + confidence score are written on-chain.

### Flow

```
Scan iris → Backend stores templates → CRE workflow (TEE) fetches via Confidential HTTP
→ Hamming distance computed in TEE → Signed report → KeystoneForwarder → onReport()
→ Match stored → Extension calls approveTransaction() → Transaction sent
```

## Contracts

- **IrisRegistry** — Registers wallets bound to a unique iris hash. Tracks active/deactivated status.
- **IrisVerifier** — Receives iris match results from the Chainlink CRE oracle (via `onReport`) or direct oracle call, approves transactions with anti-replay and expiration. Implements `IReceiver` interface for CRE compatibility.

## ABIs

Pre-exported in `abi/`:
- `abi/IrisRegistry.json`
- `abi/IrisVerifier.json`

## Usage Examples

### Register a wallet (from extension/backend)

```solidity
IrisRegistry.registerWallet(walletAddress, irisHash);
```

### Submit iris match result (from Chainlink CRE oracle)

```solidity
// Path 1: Direct oracle
IrisVerifier.submitMatchResult(walletAddress, true, 95, nonce);

// Path 2: Via KeystoneForwarder (CRE report)
// The forwarder calls onReport() automatically after the CRE workflow submits a report
```

### Approve a transaction after iris match

```solidity
IrisVerifier.approveTransaction(walletAddress, txHash);
```

### Check if a transaction is approved

```solidity
bool approved = IrisVerifier.isTransactionApproved(walletAddress, txHash);
```

### Configure the KeystoneForwarder (admin)

```solidity
IrisVerifier.setKeystoneForwarder(keystoneForwarderAddress);
```

## Development

```bash
# Build
forge build

# Test
forge test -v

# Deploy locally
anvil &
DEPLOYER_PRIVATE_KEY=0xac09... ORACLE_ADDRESS=0x... forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# Deploy to Sepolia with KeystoneForwarder
source .env
KEYSTONE_FORWARDER=0x... forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast
```

## Stack

- Solidity 0.8.28
- Foundry (forge, cast, anvil)
- Ethereum Sepolia (Chain ID 11155111)
- Chainlink CRE (Confidential Runtime Environment)
