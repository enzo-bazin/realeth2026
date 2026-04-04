// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {WorldIDVerifier} from "./WorldIDVerifier.sol";

/// @title IrisRegistry
/// @author IrisWallet Team — ETHGlobal Cannes 2026
/// @notice Registry that binds iris-authenticated wallets to World ID nullifiers.
/// @dev Each nullifier can only have one wallet. Wallets can be deactivated and reactivated.
contract IrisRegistry {
    /// @notice Information about a registered wallet.
    /// @param wallet The wallet address.
    /// @param registeredAt Timestamp of registration.
    /// @param active Whether the wallet is currently active.
    struct WalletInfo {
        address wallet;
        uint256 registeredAt;
        bool active;
    }

    /// @notice The WorldIDVerifier contract used for proof verification during registration.
    WorldIDVerifier public immutable worldIdVerifier;

    /// @notice The contract owner (deployer).
    address public owner;

    /// @notice Maps nullifier hashes to their wallet info.
    mapping(uint256 => WalletInfo) public wallets;

    /// @notice Total number of registered wallets.
    uint256 public totalRegistered;

    /// @notice Emitted when a new wallet is registered.
    event WalletRegistered(uint256 indexed nullifierHash, address indexed wallet);

    /// @notice Emitted when a wallet is deactivated.
    event WalletDeactivated(uint256 indexed nullifierHash, address indexed wallet);

    /// @notice Emitted when a wallet is reactivated.
    event WalletReactivated(uint256 indexed nullifierHash, address indexed wallet);

    error NotRegistered(uint256 nullifierHash);
    error AlreadyRegistered(uint256 nullifierHash);
    error AlreadyActive(uint256 nullifierHash);
    error AlreadyDeactivated(uint256 nullifierHash);
    error OnlyOwnerOrWallet();
    error OnlyVerifier();

    /// @notice Restricts access to the contract owner or the wallet itself.
    modifier onlyOwnerOrWallet(uint256 nullifierHash) {
        if (msg.sender != owner && msg.sender != wallets[nullifierHash].wallet) {
            revert OnlyOwnerOrWallet();
        }
        _;
    }

    /// @notice Initializes the registry with a WorldIDVerifier.
    /// @param _worldIdVerifier The WorldIDVerifier contract address.
    constructor(WorldIDVerifier _worldIdVerifier) {
        worldIdVerifier = _worldIdVerifier;
        owner = msg.sender;
    }

    /// @notice Registers a new wallet by verifying a World ID proof.
    /// @dev Calls WorldIDVerifier.verifyAndRegister() which validates the ZKP and prevents duplicates.
    /// @param wallet The wallet address to register.
    /// @param root The World ID Merkle tree root.
    /// @param nullifierHash The unique nullifier hash from World ID.
    /// @param proof The zero-knowledge proof.
    function registerWallet(
        address wallet,
        uint256 root,
        uint256 nullifierHash,
        uint256[8] calldata proof
    ) external {
        if (wallets[nullifierHash].wallet != address(0)) {
            revert AlreadyRegistered(nullifierHash);
        }

        worldIdVerifier.verifyAndRegister(wallet, root, nullifierHash, proof);

        wallets[nullifierHash] = WalletInfo({
            wallet: wallet,
            registeredAt: block.timestamp,
            active: true
        });
        totalRegistered++;

        emit WalletRegistered(nullifierHash, wallet);
    }

    /// @notice Deactivates a registered wallet. Only callable by the owner or the wallet itself.
    /// @param nullifierHash The nullifier hash of the wallet to deactivate.
    function deactivateWallet(uint256 nullifierHash) external onlyOwnerOrWallet(nullifierHash) {
        WalletInfo storage info = wallets[nullifierHash];
        if (info.wallet == address(0)) revert NotRegistered(nullifierHash);
        if (!info.active) revert AlreadyDeactivated(nullifierHash);

        info.active = false;
        emit WalletDeactivated(nullifierHash, info.wallet);
    }

    /// @notice Reactivates a previously deactivated wallet. Only callable by the owner or the wallet itself.
    /// @param nullifierHash The nullifier hash of the wallet to reactivate.
    function reactivateWallet(uint256 nullifierHash) external onlyOwnerOrWallet(nullifierHash) {
        WalletInfo storage info = wallets[nullifierHash];
        if (info.wallet == address(0)) revert NotRegistered(nullifierHash);
        if (info.active) revert AlreadyActive(nullifierHash);

        info.active = true;
        emit WalletReactivated(nullifierHash, info.wallet);
    }

    /// @notice Returns the full wallet info for a given nullifier.
    /// @param nullifierHash The nullifier hash to look up.
    /// @return The WalletInfo struct.
    function getWallet(uint256 nullifierHash) external view returns (WalletInfo memory) {
        return wallets[nullifierHash];
    }

    /// @notice Checks whether a nullifier has a registered wallet.
    /// @param nullifierHash The nullifier hash to check.
    /// @return True if registered.
    function isRegistered(uint256 nullifierHash) external view returns (bool) {
        return wallets[nullifierHash].wallet != address(0);
    }

    /// @notice Checks whether a registered wallet is currently active.
    /// @param nullifierHash The nullifier hash to check.
    /// @return True if active.
    function isActive(uint256 nullifierHash) external view returns (bool) {
        return wallets[nullifierHash].active;
    }
}
