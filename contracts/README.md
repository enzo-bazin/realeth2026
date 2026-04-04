# IrisWallet — Smart Contracts

Iris-authenticated blockchain wallet smart contracts deployed on World Chain.

## Deployed Contracts (World Chain Sepolia — Chain ID 4801)

| Contract | Address |
|----------|---------|
| WorldIDVerifier | `0xB271E36459D64Ed2eB6a8bAbbEbD6e271c5d4332` |
| IrisRegistry | `0x89ab6cb2f09Fac7Fa1A0EC07725301FB7a085f6c` |
| IrisVerifier | `0xe2D8794bf15FB33dC09Ad2B231A3a9b04A32ccBf` |

## Architecture

```
WorldIDVerifier          IrisRegistry           IrisVerifier
  (World ID ZKP)  <---  (wallet registry)  <---  (iris match oracle)
       |                      |                        |
  World ID Router       nullifier->wallet        Chainlink CRE
```

- **WorldIDVerifier** — Verifies World ID ZK proofs and binds nullifier <-> wallet (1:1).
- **IrisRegistry** — Registers wallets via World ID, tracks active/deactivated status.
- **IrisVerifier** — Receives iris match results from the Chainlink CRE oracle, approves transactions with anti-replay and expiration.

## ABIs

Pre-exported in `abi/`:
- `abi/WorldIDVerifier.json`
- `abi/IrisRegistry.json`
- `abi/IrisVerifier.json`

## Usage Examples

### Register a wallet (from extension/backend)

```solidity
IrisRegistry.registerWallet(walletAddress, root, nullifierHash, proof);
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

# Deploy to World Chain Sepolia
source .env
forge script script/Deploy.s.sol --rpc-url $WORLD_CHAIN_TESTNET_RPC_URL --broadcast
```

## Stack

- Solidity 0.8.28
- Foundry (forge, cast, anvil)
- World ID Contracts v1.0.0
- OpenZeppelin Contracts
- World Chain Sepolia (Chain ID 4801)
