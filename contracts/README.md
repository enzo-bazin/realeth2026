# IrisWallet — Smart Contracts

Iris-authenticated blockchain wallet smart contracts.

## Deployed Contracts (Ethereum Sepolia — Chain ID 11155111)

| Contract | Address |
|----------|---------|
| IrisRegistry | `0xc48326f0031DeCbd53CF97835382C638E83f2785` |
| IrisVerifier | `0x8a5F9475e329375fbE17a2766c43c9EFd165C645` |

## Architecture

```
IrisRegistry              IrisVerifier
(iris hash <-> wallet)  <---  (iris match oracle)
      |                            |
  1 iris = 1 wallet          Chainlink CRE
```

- **IrisRegistry** — Registers wallets bound to a unique iris hash. Tracks active/deactivated status.
- **IrisVerifier** — Receives iris match results from the Chainlink CRE oracle, approves transactions with anti-replay and expiration.

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
IrisVerifier.submitMatchResult(walletAddress, true, 95, nonce);
```

### Approve a transaction after iris match

```solidity
IrisVerifier.approveTransaction(walletAddress, txHash);
```

### Check if a transaction is approved

```solidity
bool approved = IrisVerifier.isTransactionApproved(walletAddress, txHash);
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

# Deploy to Sepolia
source .env
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast
```

## Stack

- Solidity 0.8.28
- Foundry (forge, cast, anvil)
- Ethereum Sepolia (Chain ID 11155111)
