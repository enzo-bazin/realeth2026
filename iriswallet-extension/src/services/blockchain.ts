import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type Address,
} from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

// Deployed on Ethereum Sepolia
const IRIS_REGISTRY_ADDRESS = '0x8c2E25DBe7cF9D132e4811a87E117077BB86D5d0' as const;
const IRIS_VERIFIER_ADDRESS = '0x8a5F9475e329375fbE17a2766c43c9EFd165C645' as const;

const irisRegistryAbi = [
  {
    type: 'function',
    name: 'registerWallet',
    inputs: [
      { name: 'wallet', type: 'address' },
      { name: 'irisHash', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const irisVerifierAbi = [
  {
    type: 'function',
    name: 'hasValidMatch',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'approveTransaction',
    inputs: [
      { name: 'wallet', type: 'address' },
      { name: 'txHash', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'isTransactionApproved',
    inputs: [
      { name: 'wallet', type: 'address' },
      { name: 'txHash', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

// Deployer pays gas (Sepolia testnet)
const DEPLOYER_PK = '0x9ab3c6d32d7c1dfd56edde00ec96692d7c3b2551c02466cceb85fb80ed2245d1' as Hex;

// --- Wallet storage (by address) ---

function storePK(address: Address, pk: Hex) {
  localStorage.setItem(`iw_pk_${address.toLowerCase()}`, pk);
}

function loadPK(address: Address): Hex | null {
  return localStorage.getItem(`iw_pk_${address.toLowerCase()}`) as Hex | null;
}

// Generate a new wallet and store its key
export function createWallet(): { address: Address; privateKey: Hex } {
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  storePK(account.address, pk);
  return { address: account.address, privateKey: pk };
}

// --- On-chain ---

function irisHashToBytes32(irisHash: string): Hex {
  const clean = irisHash.replace(/^0x/, '');
  return `0x${clean.padEnd(64, '0')}` as Hex;
}

export async function registerOnChain(walletAddress: Address, irisHash: string): Promise<Hex> {
  const deployer = privateKeyToAccount(DEPLOYER_PK);
  const walletClient = createWalletClient({
    account: deployer,
    chain: sepolia,
    transport: http(),
  });

  const txHash = await walletClient.writeContract({
    address: IRIS_REGISTRY_ADDRESS,
    abi: irisRegistryAbi,
    functionName: 'registerWallet',
    args: [walletAddress, irisHashToBytes32(irisHash)],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

// --- Balance ---

export async function getBalance(address: Address): Promise<bigint> {
  return publicClient.getBalance({ address });
}

// --- Chainlink CRE iris verification ---

/**
 * Polls IrisVerifier.hasValidMatch() until the CRE workflow submits a result.
 * Resolves true if a valid match is found, rejects after timeout.
 */
export async function waitForCREMatch(
  walletAddress: Address,
  timeoutMs: number = 120_000,
  pollIntervalMs: number = 3_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const hasMatch = await publicClient.readContract({
      address: IRIS_VERIFIER_ADDRESS,
      abi: irisVerifierAbi,
      functionName: 'hasValidMatch',
      args: [walletAddress],
    });

    if (hasMatch) return true;

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error('Timeout: Chainlink CRE verification did not complete in time');
}

/**
 * Approves a transaction on IrisVerifier after CRE match is confirmed.
 * The deployer pays gas on testnet.
 */
export async function approveTransactionOnChain(
  walletAddress: Address,
  txHash: Hex,
): Promise<Hex> {
  const deployer = privateKeyToAccount(DEPLOYER_PK);
  const walletClient = createWalletClient({
    account: deployer,
    chain: sepolia,
    transport: http(),
  });

  const approveTxHash = await walletClient.writeContract({
    address: IRIS_VERIFIER_ADDRESS,
    abi: irisVerifierAbi,
    functionName: 'approveTransaction',
    args: [walletAddress, txHash],
  });

  await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
  return approveTxHash;
}

// --- Send transaction ---

export async function sendTransaction(fromAddress: Address, to: Address, amountEth: string): Promise<Hex> {
  const pk = loadPK(fromAddress);
  if (!pk) throw new Error('Cle privee introuvable pour ce wallet');

  const walletClient = createWalletClient({
    account: privateKeyToAccount(pk),
    chain: sepolia,
    transport: http(),
  });

  const value = BigInt(Math.floor(parseFloat(amountEth) * 1e18));

  const txHash = await walletClient.sendTransaction({ to, value });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}
