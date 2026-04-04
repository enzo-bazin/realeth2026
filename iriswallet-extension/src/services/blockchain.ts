import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type Address,
} from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

// Deployed on Ethereum Sepolia (Chain ID 11155111)
const IRIS_REGISTRY_ADDRESS = '0xD12235D4f1065dDDcbec1906A31BCeDE35128D79' as const;
const IRIS_VERIFIER_ADDRESS = '0x0120Fb9D680115F21566c5D79b39fB2157CdFC08' as const;

// ABI (only the functions we need)
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
  {
    type: 'function',
    name: 'isRegistered',
    inputs: [{ name: 'irisHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isActive',
    inputs: [{ name: 'irisHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getWallet',
    inputs: [{ name: 'irisHash', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'wallet', type: 'address' },
          { name: 'registeredAt', type: 'uint256' },
          { name: 'active', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'walletToIrisHash',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalRegistered',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'WalletRegistered',
    inputs: [
      { name: 'irisHash', type: 'bytes32', indexed: true },
      { name: 'wallet', type: 'address', indexed: true },
    ],
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
    name: 'isTransactionApproved',
    inputs: [
      { name: 'wallet', type: 'address' },
      { name: 'txHash', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

// Public client for reads
export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

// Convert iris hash string (hex like "3ca5be7121cec71d") to bytes32
export function irisHashToBytes32(irisHash: string): Hex {
  // Pad the iris hash to 32 bytes
  const clean = irisHash.replace(/^0x/, '');
  return `0x${clean.padEnd(64, '0')}` as Hex;
}

// Check if an iris is already registered on-chain
export async function isIrisRegistered(irisHash: string): Promise<boolean> {
  const bytes32Hash = irisHashToBytes32(irisHash);
  return publicClient.readContract({
    address: IRIS_REGISTRY_ADDRESS,
    abi: irisRegistryAbi,
    functionName: 'isRegistered',
    args: [bytes32Hash],
  });
}

// Get wallet info from on-chain registry
export async function getOnChainWallet(irisHash: string): Promise<{
  wallet: Address;
  registeredAt: bigint;
  active: boolean;
} | null> {
  const bytes32Hash = irisHashToBytes32(irisHash);
  const result = await publicClient.readContract({
    address: IRIS_REGISTRY_ADDRESS,
    abi: irisRegistryAbi,
    functionName: 'getWallet',
    args: [bytes32Hash],
  });
  if (result.wallet === '0x0000000000000000000000000000000000000000') {
    return null;
  }
  return result;
}

// Get total registered wallets
export async function getTotalRegistered(): Promise<bigint> {
  return publicClient.readContract({
    address: IRIS_REGISTRY_ADDRESS,
    abi: irisRegistryAbi,
    functionName: 'totalRegistered',
  });
}

// Deployer pays gas — Sepolia testnet only
const DEPLOYER_PK = '0x9ab3c6d32d7c1dfd56edde00ec96692d7c3b2551c02466cceb85fb80ed2245d1' as Hex;

// Generate a fresh wallet for a new user, or load existing one from localStorage
function getOrCreateUserWallet(irisHash: string): { privateKey: Hex; address: Address } {
  const STORAGE_KEY = `iriswallet_user_${irisHash}`;
  let pk = localStorage.getItem(STORAGE_KEY);
  if (!pk) {
    pk = generatePrivateKey();
    localStorage.setItem(STORAGE_KEY, pk);
  }
  const account = privateKeyToAccount(pk as Hex);
  return { privateKey: pk as Hex, address: account.address };
}

// Register a wallet on-chain — deployer pays gas, user gets a fresh address
export async function registerOnChain(irisHash: string): Promise<{
  walletAddress: Address;
  txHash: Hex;
}> {
  const userWallet = getOrCreateUserWallet(irisHash);

  const deployer = privateKeyToAccount(DEPLOYER_PK);
  const walletClient = createWalletClient({
    account: deployer,
    chain: sepolia,
    transport: http(),
  });

  const bytes32Hash = irisHashToBytes32(irisHash);

  const txHash = await walletClient.writeContract({
    address: IRIS_REGISTRY_ADDRESS,
    abi: irisRegistryAbi,
    functionName: 'registerWallet',
    args: [userWallet.address, bytes32Hash],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return { walletAddress: userWallet.address, txHash };
}

// Get the deployer address
export function getSignerAddress(): Address {
  return privateKeyToAccount(DEPLOYER_PK).address;
}

// Check if a wallet has a valid iris match (for transaction approval)
export async function hasValidMatch(walletAddress: Address): Promise<boolean> {
  return publicClient.readContract({
    address: IRIS_VERIFIER_ADDRESS,
    abi: irisVerifierAbi,
    functionName: 'hasValidMatch',
    args: [walletAddress],
  });
}

// Get balance on World Chain Sepolia
export async function getBalance(address: Address): Promise<bigint> {
  return publicClient.getBalance({ address });
}
