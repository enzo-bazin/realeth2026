// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IReceiver
/// @notice Interface for contracts that receive reports from the Chainlink KeystoneForwarder.
/// @dev See https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts
interface IReceiver {
    /// @notice Called by the KeystoneForwarder to deliver a signed report.
    /// @param metadata Forwarder metadata (workflow ID, owner, report name, etc.).
    /// @param report ABI-encoded report payload.
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
