import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  encodePacked,
  type Hex,
  type Address,
} from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

// Deployed on Ethereum Sepolia
const IRIS_REGISTRY_ADDRESS = '0x8c2E25DBe7cF9D132e4811a87E117077BB86D5d0' as const;

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

const irisMultisigAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: '_irisOwner', type: 'address' },
      { name: '_ledgerOwner', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'execute',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'irisSig', type: 'bytes' },
      { name: 'ledgerSig', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'nonce',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getMessageHash',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
] as const;

// IrisMultisig bytecode — will be set after compilation
// To get this: cd contracts && forge inspect IrisMultisig bytecode
const IRIS_MULTISIG_BYTECODE = '0x6080604052348015600e575f5ffd5b506040516106be3803806106be833981016040819052602b916074565b5f80546001600160a01b039384166001600160a01b0319918216179091556001805492909316911617905560a0565b80516001600160a01b0381168114606f575f5ffd5b919050565b5f5f604083850312156084575f5ffd5b608b83605a565b9150609760208401605a565b90509250929050565b610611806100ad5f395ff3fe60806040526004361061004c575f3560e01c8063512c91df14610057578063affed0e014610089578063b219c5db1461009e578063cc4cef90146100d5578063da0980c7146100f3575f5ffd5b3661005357005b5f5ffd5b348015610062575f5ffd5b5061007661007136600461046a565b610114565b6040519081526020015b60405180910390f35b348015610094575f5ffd5b5061007660025481565b3480156100a9575f5ffd5b506001546100bd906001600160a01b031681565b6040516001600160a01b039091168152602001610080565b3480156100e0575f5ffd5b505f546100bd906001600160a01b031681565b3480156100fe575f5ffd5b5061011261010d3660046104d7565b610196565b005b5f5f83836002543060405160200161012f9493929190610560565b60408051808303601f1901815282825280516020918201207f19457468657265756d205369676e6564204d6573736167653a0a33320000000082850152603c8085019190915282518085039091018152605c90930190915281519101209150505b92915050565b5f8686600254306040516020016101b09493929190610560565b6040516020818303038152906040528051906020012090505f8160405160200161020691907f19457468657265756d205369676e6564204d6573736167653a0a3332000000008152601c810191909152603c0190565b6040516020818303038152906040528051906020012090505f61022a82888861036f565b5f549091506001600160a01b0380831691161461025a57604051630487dff560e01b815260040160405180910390fd5b5f61026683878761036f565b6001549091506001600160a01b0380831691161461029757604051633199f2a760e11b815260040160405180910390fd5b600280549081905f6102a8836105aa565b91905055505f8b6001600160a01b03168b6040515f6040518083038185875af1925050503d805f81146102f6576040519150601f19603f3d011682016040523d82523d5f602084013e6102fb565b606091505b505090508061031d57604051632b3f6d1160e21b815260040160405180910390fd5b604080518c8152602081018490526001600160a01b038e16917f7dd684d9b29996680eb4c0ae7461d9983dadb8ebf5e04b3e99fae858334861b4910160405180910390a2505050505050505050505050565b5f604182146103c45760405162461bcd60e51b815260206004820152601860248201527f496e76616c6964207369676e6174757265206c656e6774680000000000000000604482015260640160405180910390fd5b8235602084013560408501355f1a601b8110156103e9576103e6601b826105c2565b90505b604080515f81526020810180835289905260ff831691810191909152606081018490526080810183905260019060a0016020604051602081039080840390855afa158015610439573d5f5f3e3d5ffd5b5050604051601f19015198975050505050505050565b80356001600160a01b0381168114610465575f5ffd5b919050565b5f5f6040838503121561047b575f5ffd5b6104848361044f565b946020939093013593505050565b5f5f83601f8401126104a2575f5ffd5b50813567ffffffffffffffff8111156104b9575f5ffd5b6020830191508360208285010111156104d0575f5ffd5b9250929050565b5f5f5f5f5f5f608087890312156104ec575f5ffd5b6104f58761044f565b955060208701359450604087013567ffffffffffffffff811115610517575f5ffd5b61052389828a01610492565b909550935050606087013567ffffffffffffffff811115610542575f5ffd5b61054e89828a01610492565b979a9699509497509295939492505050565b6bffffffffffffffffffffffff19606095861b811682526014820194909452603481019290925290921b16605482015260680190565b634e487b7160e01b5f52601160045260245ffd5b5f600182016105bb576105bb610596565b5060010190565b60ff81811683821601908111156101905761019061059656fea2646970667358221220e9957a08603c5adc9d14f70bd6ba8a6bbf20fdccdc5bc4a5fb6bbaedfe6c109464736f6c634300081c0033' as Hex;

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

// Deployer pays gas (Sepolia testnet)
const DEPLOYER_PK = '0x9ab3c6d32d7c1dfd56edde00ec96692d7c3b2551c02466cceb85fb80ed2245d1' as Hex;

// --- Wallet storage (by address) ---

export function storePK(address: Address, pk: Hex) {
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

// --- Simple send transaction (non-multisig) ---

export async function sendTransaction(fromAddress: Address, to: Address, amountEth: string): Promise<Hex> {
  const pk = loadPK(fromAddress);
  if (!pk) throw new Error('Private key not found for this wallet');

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

// --- Multisig ---

export async function deployMultisig(irisAddress: Address, ledgerAddress: Address): Promise<{ contractAddress: Address; txHash: Hex }> {
  const deployer = privateKeyToAccount(DEPLOYER_PK);
  const walletClient = createWalletClient({
    account: deployer,
    chain: sepolia,
    transport: http(),
  });

  const txHash = await walletClient.deployContract({
    abi: irisMultisigAbi,
    bytecode: IRIS_MULTISIG_BYTECODE,
    args: [irisAddress, ledgerAddress],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (!receipt.contractAddress) throw new Error('Multisig deployment failed');

  return { contractAddress: receipt.contractAddress as Address, txHash };
}

export async function getMultisigNonce(multisigAddress: Address): Promise<bigint> {
  return publicClient.readContract({
    address: multisigAddress,
    abi: irisMultisigAbi,
    functionName: 'nonce',
  });
}

export async function getMultisigDataHash(multisigAddress: Address, to: Address, value: bigint): Promise<Hex> {
  const nonce = await getMultisigNonce(multisigAddress);
  return keccak256(
    encodePacked(
      ['address', 'uint256', 'uint256', 'address'],
      [to, value, nonce, multisigAddress],
    ),
  );
}

export async function signMessageWithIrisKey(irisAddress: Address, dataHash: Hex): Promise<Hex> {
  const pk = loadPK(irisAddress);
  if (!pk) throw new Error('Iris private key not found');

  const account = privateKeyToAccount(pk);
  // signMessage adds the EIP-191 prefix, matching the contract's ecrecover
  const signature = await account.signMessage({ message: { raw: dataHash as `0x${string}` } });
  return signature;
}

export async function executeMultisig(
  multisigAddress: Address,
  to: Address,
  amountEth: string,
  irisSig: Hex,
  ledgerSig: Hex,
): Promise<Hex> {
  const deployer = privateKeyToAccount(DEPLOYER_PK);
  const walletClient = createWalletClient({
    account: deployer,
    chain: sepolia,
    transport: http(),
  });

  const value = BigInt(Math.floor(parseFloat(amountEth) * 1e18));

  const txHash = await walletClient.writeContract({
    address: multisigAddress,
    abi: irisMultisigAbi,
    functionName: 'execute',
    args: [to, value, irisSig, ledgerSig],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}
