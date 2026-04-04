// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IWorldID} from "@worldcoin/interfaces/IWorldID.sol";

/// @title WorldIDVerifier
/// @author IrisWallet Team — ETHGlobal Cannes 2026
/// @notice Verifies World ID zero-knowledge proofs and binds a unique nullifier to a wallet address.
/// @dev Uses the World ID Router deployed on World Chain. Each nullifier can only be registered once (anti-sybil).
contract WorldIDVerifier {
    /// @notice The World ID Router contract used for proof verification.
    IWorldID public immutable worldId;

    /// @notice Hash of the app ID and action ID, used as external nullifier for World ID proofs.
    uint256 public immutable externalNullifierHash;

    /// @notice Maps a World ID nullifier hash to its registered wallet address.
    mapping(uint256 => address) public nullifierToWallet;

    /// @notice Maps a wallet address to its World ID nullifier hash.
    mapping(address => uint256) public walletToNullifier;

    /// @notice Emitted when a wallet is successfully registered with a World ID nullifier.
    /// @param wallet The registered wallet address.
    /// @param nullifierHash The World ID nullifier hash linked to the wallet.
    event WalletRegistered(address indexed wallet, uint256 nullifierHash);

    /// @notice Thrown when attempting to register a nullifier that is already in use.
    error DuplicateNullifier(uint256 nullifierHash);

    /// @notice Thrown when attempting to register a wallet that already has a nullifier.
    error WalletAlreadyRegistered(address wallet);

    /// @notice Initializes the verifier with the World ID Router and app/action identifiers.
    /// @param _worldId The World ID Router contract address.
    /// @param _appId The World ID app identifier (e.g. "app_iriswallet").
    /// @param _actionId The World ID action identifier (e.g. "create-iris-wallet").
    constructor(IWorldID _worldId, string memory _appId, string memory _actionId) {
        worldId = _worldId;
        externalNullifierHash = uint256(keccak256(abi.encodePacked(uint256(keccak256(abi.encodePacked(_appId))), _actionId)));
    }

    /// @notice Verifies a World ID proof and registers the wallet.
    /// @dev Reverts if the nullifier or wallet is already registered, or if the proof is invalid.
    /// @param wallet The wallet address to register.
    /// @param root The Merkle tree root from World ID.
    /// @param nullifierHash The nullifier hash proving unique humanness.
    /// @param proof The zero-knowledge proof (8 uint256 values).
    function verifyAndRegister(
        address wallet,
        uint256 root,
        uint256 nullifierHash,
        uint256[8] calldata proof
    ) external {
        if (nullifierToWallet[nullifierHash] != address(0)) {
            revert DuplicateNullifier(nullifierHash);
        }
        if (walletToNullifier[wallet] != 0) {
            revert WalletAlreadyRegistered(wallet);
        }

        uint256 signalHash = uint256(keccak256(abi.encodePacked(wallet)));

        worldId.verifyProof(
            root,
            signalHash,
            nullifierHash,
            externalNullifierHash,
            proof
        );

        nullifierToWallet[nullifierHash] = wallet;
        walletToNullifier[wallet] = nullifierHash;

        emit WalletRegistered(wallet, nullifierHash);
    }

    /// @notice Checks whether a wallet address has been registered.
    /// @param wallet The wallet address to check.
    /// @return True if the wallet is registered.
    function isRegistered(address wallet) external view returns (bool) {
        return walletToNullifier[wallet] != 0;
    }

    /// @notice Returns the wallet address linked to a given nullifier hash.
    /// @param nullifierHash The nullifier hash to look up.
    /// @return The wallet address, or address(0) if not registered.
    function getWallet(uint256 nullifierHash) external view returns (address) {
        return nullifierToWallet[nullifierHash];
    }
}
