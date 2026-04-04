// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IrisRegistry} from "./IrisRegistry.sol";
import {IReceiver} from "./interfaces/IReceiver.sol";

/// @title IrisVerifier
/// @author IrisWallet Team — ETHGlobal Cannes 2026
/// @notice Receives iris biometric match results from the Chainlink CRE oracle and approves transactions.
/// @dev Supports two ingestion paths:
///   1. Direct oracle call via submitMatchResult() (legacy / testing)
///   2. Chainlink CRE report via onReport() through the KeystoneForwarder
///  Match results expire after a configurable number of blocks. Each result has a unique nonce to prevent replay.
contract IrisVerifier is IReceiver {
    /// @notice Result of an iris biometric match submitted by the oracle.
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

    /// @notice The Chainlink KeystoneForwarder address authorized to deliver CRE reports.
    address public keystoneForwarder;

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

    /// @notice Emitted when the KeystoneForwarder address is updated.
    event ForwarderUpdated(address indexed oldForwarder, address indexed newForwarder);

    /// @notice Emitted when a CRE report is received and processed.
    event ReportReceived(address indexed wallet, bool matched, uint256 confidence, uint256 nonce);

    error OnlyOracle();
    error OnlyOwner();
    error OnlyForwarder();
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

    modifier onlyForwarder() {
        if (msg.sender != keystoneForwarder) revert OnlyForwarder();
        _;
    }

    /// @notice Initializes the verifier with the registry, oracle, and expiration config.
    /// @param _irisRegistry The IrisRegistry contract address.
    /// @param _oracle The authorized oracle address (Chainlink CRE or direct).
    /// @param _expirationBlocks Number of blocks before a match result expires.
    constructor(IrisRegistry _irisRegistry, address _oracle, uint256 _expirationBlocks) {
        irisRegistry = _irisRegistry;
        oracle = _oracle;
        expirationBlocks = _expirationBlocks;
        owner = msg.sender;
    }

    // =====================================================================
    // Path 1: Direct oracle submission (legacy / testing)
    // =====================================================================

    /// @notice Submits an iris match result. Only callable by the authorized oracle.
    function submitMatchResult(
        address wallet,
        bool matched,
        uint256 confidence,
        uint256 nonce
    ) external onlyOracle {
        _processMatchResult(wallet, matched, confidence, nonce);
    }

    // =====================================================================
    // Path 2: Chainlink CRE report via KeystoneForwarder
    // =====================================================================

    /// @notice Called by the KeystoneForwarder to deliver a CRE report.
    /// @dev Decodes the ABI-encoded report into (wallet, matched, confidence, nonce)
    ///      and processes it through the same logic as submitMatchResult.
    /// @param report ABI-encoded (address wallet, bool matched, uint256 confidence, uint256 nonce).
    function onReport(bytes calldata /* metadata */, bytes calldata report) external onlyForwarder {
        (
            address wallet,
            bool matched,
            uint256 confidence,
            uint256 nonce
        ) = abi.decode(report, (address, bool, uint256, uint256));

        _processMatchResult(wallet, matched, confidence, nonce);

        emit ReportReceived(wallet, matched, confidence, nonce);
    }

    // =====================================================================
    // Transaction approval
    // =====================================================================

    /// @notice Approves a transaction if the wallet has a valid (non-expired, matched) iris result.
    /// @dev Consumes the match result after approval (one match = one transaction).
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

    // =====================================================================
    // View functions
    // =====================================================================

    /// @notice Checks if a specific transaction has been approved for a wallet.
    function isTransactionApproved(address wallet, bytes32 txHash) external view returns (bool) {
        bytes32 key = keccak256(abi.encodePacked(wallet, txHash));
        return approvedTransactions[key];
    }

    /// @notice Checks if a wallet currently has a valid (matched, non-expired) iris result.
    function hasValidMatch(address wallet) external view returns (bool) {
        MatchResult memory result = latestMatch[wallet];
        return result.matched && block.number <= result.expiresAtBlock;
    }

    // =====================================================================
    // Admin
    // =====================================================================

    /// @notice Updates the authorized oracle address. Only callable by the owner.
    function setOracle(address _oracle) external onlyOwner {
        address old = oracle;
        oracle = _oracle;
        emit OracleUpdated(old, _oracle);
    }

    /// @notice Updates the KeystoneForwarder address. Only callable by the owner.
    function setKeystoneForwarder(address _forwarder) external onlyOwner {
        address old = keystoneForwarder;
        keystoneForwarder = _forwarder;
        emit ForwarderUpdated(old, _forwarder);
    }

    /// @notice Updates the match result expiration period. Only callable by the owner.
    function setExpirationBlocks(uint256 _blocks) external onlyOwner {
        expirationBlocks = _blocks;
    }

    // =====================================================================
    // Internal
    // =====================================================================

    /// @dev Shared logic for processing a match result from any source.
    function _processMatchResult(
        address wallet,
        bool matched,
        uint256 confidence,
        uint256 nonce
    ) internal {
        _checkActiveWallet(wallet);

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

    /// @dev Verifies that a wallet is registered and active in the IrisRegistry.
    function _checkActiveWallet(address wallet) internal view {
        bytes32 irisHash = irisRegistry.walletToIrisHash(wallet);
        if (irisHash == bytes32(0)) revert WalletNotRegistered(wallet);
        if (!irisRegistry.isActive(irisHash)) revert WalletNotActive(wallet);
    }
}
