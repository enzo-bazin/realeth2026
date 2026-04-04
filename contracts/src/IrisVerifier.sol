// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IrisRegistry} from "./IrisRegistry.sol";

/// @title IrisVerifier
/// @author IrisWallet Team — ETHGlobal Cannes 2026
/// @notice Receives iris biometric match results from the Chainlink CRE oracle and approves transactions.
/// @dev Match results expire after a configurable number of blocks. Each result has a unique nonce to prevent replay.
contract IrisVerifier {
    /// @notice Result of an iris biometric match submitted by the oracle.
    /// @param matched Whether the iris matched.
    /// @param confidence Confidence score (0-100).
    /// @param timestamp Block timestamp when the result was submitted.
    /// @param expiresAtBlock Block number after which the result is no longer valid.
    struct MatchResult {
        bool matched;
        uint256 confidence;
        uint256 timestamp;
        uint256 expiresAtBlock;
    }

    /// @notice The IrisRegistry contract used to verify wallet registration and active status.
    IrisRegistry public immutable irisRegistry;

    /// @notice The authorized Chainlink CRE oracle address that can submit match results.
    address public oracle;

    /// @notice Number of blocks after which a match result expires.
    uint256 public expirationBlocks;

    /// @notice Tracks used nonces per wallet to prevent replay attacks.
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    /// @notice Stores the latest match result for each wallet.
    mapping(address => MatchResult) public latestMatch;

    /// @notice Tracks which transactions have been approved via iris verification.
    mapping(bytes32 => bool) public approvedTransactions;

    /// @notice Emitted when the oracle submits a new iris match result.
    event MatchResultSubmitted(address indexed wallet, bool matched, uint256 confidence, uint256 nonce);

    /// @notice Emitted when a transaction is approved after successful iris verification.
    event TransactionApproved(address indexed wallet, bytes32 indexed txHash);

    /// @notice Emitted when the oracle address is updated.
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);

    error OnlyOracle();
    error OnlyOwner();
    error NonceAlreadyUsed(uint256 nonce);
    error WalletNotRegistered(address wallet);
    error WalletNotActive(address wallet);
    error MatchExpired();
    error MatchFailed();
    error NoMatchResult();

    /// @notice The contract owner (deployer).
    address public owner;

    modifier onlyOracle() {
        if (msg.sender != oracle) revert OnlyOracle();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    /// @notice Initializes the verifier with the registry, oracle, and expiration config.
    /// @param _irisRegistry The IrisRegistry contract address.
    /// @param _oracle The authorized oracle address (Chainlink CRE).
    /// @param _expirationBlocks Number of blocks before a match result expires.
    constructor(IrisRegistry _irisRegistry, address _oracle, uint256 _expirationBlocks) {
        irisRegistry = _irisRegistry;
        oracle = _oracle;
        expirationBlocks = _expirationBlocks;
        owner = msg.sender;
    }

    /// @notice Submits an iris match result. Only callable by the authorized oracle.
    /// @dev Checks that the wallet is registered and active, and that the nonce hasn't been used.
    /// @param wallet The wallet whose iris was verified.
    /// @param matched Whether the iris scan matched the stored template.
    /// @param confidence Confidence score of the match (0-100).
    /// @param nonce Unique nonce to prevent replay attacks.
    function submitMatchResult(
        address wallet,
        bool matched,
        uint256 confidence,
        uint256 nonce
    ) external onlyOracle {
        _getActiveNullifier(wallet);

        if (usedNonces[wallet][nonce]) revert NonceAlreadyUsed(nonce);
        usedNonces[wallet][nonce] = true;

        latestMatch[wallet] = MatchResult({
            matched: matched,
            confidence: confidence,
            timestamp: block.timestamp,
            expiresAtBlock: block.number + expirationBlocks
        });

        emit MatchResultSubmitted(wallet, matched, confidence, nonce);
    }

    /// @notice Approves a transaction if the wallet has a valid (non-expired, matched) iris result.
    /// @dev Consumes the match result after approval (one match = one transaction).
    /// @param wallet The wallet requesting transaction approval.
    /// @param txHash The hash of the transaction to approve.
    function approveTransaction(address wallet, bytes32 txHash) external {
        MatchResult memory result = latestMatch[wallet];

        if (result.timestamp == 0) revert NoMatchResult();
        if (block.number > result.expiresAtBlock) revert MatchExpired();
        if (!result.matched) revert MatchFailed();

        bytes32 key = keccak256(abi.encodePacked(wallet, txHash));
        approvedTransactions[key] = true;

        delete latestMatch[wallet];

        emit TransactionApproved(wallet, txHash);
    }

    /// @notice Checks if a specific transaction has been approved for a wallet.
    /// @param wallet The wallet address.
    /// @param txHash The transaction hash.
    /// @return True if the transaction was approved.
    function isTransactionApproved(address wallet, bytes32 txHash) external view returns (bool) {
        bytes32 key = keccak256(abi.encodePacked(wallet, txHash));
        return approvedTransactions[key];
    }

    /// @notice Checks if a wallet currently has a valid (matched, non-expired) iris result.
    /// @param wallet The wallet address.
    /// @return True if a valid match exists.
    function hasValidMatch(address wallet) external view returns (bool) {
        MatchResult memory result = latestMatch[wallet];
        return result.matched && block.number <= result.expiresAtBlock;
    }

    /// @notice Updates the authorized oracle address. Only callable by the owner.
    /// @param _oracle The new oracle address.
    function setOracle(address _oracle) external onlyOwner {
        address old = oracle;
        oracle = _oracle;
        emit OracleUpdated(old, _oracle);
    }

    /// @notice Updates the match result expiration period. Only callable by the owner.
    /// @param _blocks New expiration period in blocks.
    function setExpirationBlocks(uint256 _blocks) external onlyOwner {
        expirationBlocks = _blocks;
    }

    /// @dev Verifies that a wallet is registered and active in the IrisRegistry.
    /// @param wallet The wallet to check.
    /// @return The nullifier hash associated with the wallet.
    function _getActiveNullifier(address wallet) internal view returns (uint256) {
        uint256 nullifier = irisRegistry.worldIdVerifier().walletToNullifier(wallet);
        if (nullifier == 0) revert WalletNotRegistered(wallet);
        if (!irisRegistry.isActive(nullifier)) revert WalletNotActive(wallet);
        return nullifier;
    }
}
