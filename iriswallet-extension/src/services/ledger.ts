import type { Hex } from 'viem';

const DERIVATION_PATH = "44'/60'/0'/0/0";

async function connectLedger() {
  const TransportWebHID = (await import('@ledgerhq/hw-transport-webhid')).default;
  const Eth = (await import('@ledgerhq/hw-app-eth')).default;
  const transport = await TransportWebHID.create();
  return new Eth(transport);
}

export async function getLedgerAddress(): Promise<string> {
  const eth = await connectLedger();
  try {
    const result = await eth.getAddress(DERIVATION_PATH);
    return result.address;
  } finally {
    await eth.transport.close();
  }
}

export async function signWithLedger(messageHash: Hex): Promise<Hex> {
  const eth = await connectLedger();
  try {
    const hash = messageHash.slice(2);
    const sig = await eth.signPersonalMessage(DERIVATION_PATH, hash);
    const v = (typeof sig.v === 'number' ? sig.v : parseInt(sig.v as string, 16));
    return `0x${sig.r}${sig.s}${v.toString(16).padStart(2, '0')}` as Hex;
  } finally {
    await eth.transport.close();
  }
}
