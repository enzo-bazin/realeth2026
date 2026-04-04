// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IrisMultisig
/// @author IrisWallet Team — ETHGlobal Cannes 2026
/// @notice Minimal 2-of-2 multisig wallet requiring both an iris-authenticated key and a Ledger key.
/// @dev Both owners must sign the same EIP-191 message for a transaction to execute.
contract IrisMultisig {
    /// @notice The iris-authenticated EOA (owner 1).
    address public irisOwner;

    /// @notice The Ledger hardware wallet EOA (owner 2).
    address public ledgerOwner;

    /// @notice Incrementing nonce to prevent replay attacks.
    uint256 public nonce;

    /// @notice Emitted when a transaction is executed.
    event Executed(address indexed to, uint256 value, uint256 nonce);

    error InvalidIrisSignature();
    error InvalidLedgerSignature();
    error ExecutionFailed();

    constructor(address _irisOwner, address _ledgerOwner) {
        irisOwner = _irisOwner;
        ledgerOwner = _ledgerOwner;
    }

    /// @notice Accept ETH deposits.
    receive() external payable {}

    /// @notice Execute a transaction with both signatures.
    /// @param to The recipient address.
    /// @param value The amount of ETH to send (in wei).
    /// @param irisSig The signature from the iris-authenticated key.
    /// @param ledgerSig The signature from the Ledger hardware wallet.
    function execute(
        address to,
        uint256 value,
        bytes calldata irisSig,
        bytes calldata ledgerSig
    ) external {
        bytes32 dataHash = keccak256(abi.encodePacked(to, value, nonce, address(this)));
        bytes32 messageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", dataHash));

        address recoveredIris = _recover(messageHash, irisSig);
        if (recoveredIris != irisOwner) revert InvalidIrisSignature();

        address recoveredLedger = _recover(messageHash, ledgerSig);
        if (recoveredLedger != ledgerOwner) revert InvalidLedgerSignature();

        uint256 currentNonce = nonce;
        nonce++;

        (bool success, ) = to.call{value: value}("");
        if (!success) revert ExecutionFailed();

        emit Executed(to, value, currentNonce);
    }

    /// @notice Returns the message hash that both owners must sign for a given transaction.
    /// @param to The recipient address.
    /// @param value The amount of ETH to send (in wei).
    /// @return The EIP-191 prefixed message hash.
    function getMessageHash(address to, uint256 value) external view returns (bytes32) {
        bytes32 dataHash = keccak256(abi.encodePacked(to, value, nonce, address(this)));
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", dataHash));
    }

    /// @dev Recovers the signer from a 65-byte signature.
    function _recover(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        return ecrecover(hash, v, r, s);
    }
}
