import { createUnlink, unlinkAccount, unlinkEvm } from '@unlink-xyz/sdk';
import { createWalletClient, http, type Address, type Hex } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const ENGINE_URL = 'https://staging-api.unlink.xyz';
const API_KEY = 'YMiRDYmLmHpbYjkn546gia';
export const TEST_TOKEN = '0x7501de8ea37a21e20e6e65947d2ecab0e9f061a7';

const SEED_STORAGE_KEY = 'iw_unlink_seed';

// --- Seed management ---

function getOrCreateSeed(walletAddress: string): Uint8Array {
  const key = `${SEED_STORAGE_KEY}_${walletAddress.toLowerCase()}`;
  let hex = localStorage.getItem(key);
  if (!hex) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(key, hex);
  }
  return Uint8Array.from(hex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
}

// --- Client creation ---

function getUnlinkAccount(walletAddress: string) {
  const seed = getOrCreateSeed(walletAddress);
  return unlinkAccount.fromSeed({ seed });
}

function loadPK(address: string): Hex | null {
  return localStorage.getItem(`iw_pk_${address.toLowerCase()}`) as Hex | null;
}

export function createUnlinkClient(walletAddress: Address) {
  const pk = loadPK(walletAddress);

  const config: Parameters<typeof createUnlink>[0] = {
    engineUrl: ENGINE_URL,
    apiKey: API_KEY,
    account: getUnlinkAccount(walletAddress),
  };

  // Attach EVM provider if we have the private key (needed for deposit/withdraw)
  if (pk) {
    const walletClient = createWalletClient({
      account: privateKeyToAccount(pk),
      chain: baseSepolia,
      transport: http(),
    });
    config.evm = unlinkEvm.fromViem({ walletClient });
  }

  return createUnlink(config);
}

// --- Public API ---

export async function getUnlinkAddress(walletAddress: Address): Promise<string> {
  const client = createUnlinkClient(walletAddress);
  return client.getAddress();
}

export async function getUnlinkBalances(walletAddress: Address) {
  const client = createUnlinkClient(walletAddress);
  return client.getBalances();
}

export async function requestFaucet(walletAddress: Address) {
  const client = createUnlinkClient(walletAddress);
  return client.faucet.requestPrivateTokens({ token: TEST_TOKEN });
}

export async function privateTransfer(
  walletAddress: Address,
  recipientUnlinkAddress: string,
  amount: string,
  onStatus?: (msg: string) => void,
) {
  const client = createUnlinkClient(walletAddress);

  onStatus?.('Generating ZK proof...');
  const result = await client.transfer({
    recipientAddress: recipientUnlinkAddress,
    token: TEST_TOKEN,
    amount,
  });

  onStatus?.('Confirming...');
  const confirmed = await client.pollTransactionStatus(result.txId);
  return confirmed;
}
