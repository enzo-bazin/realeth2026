// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IrisVerifier} from "../src/IrisVerifier.sol";
import {IrisRegistry} from "../src/IrisRegistry.sol";

contract IrisVerifierTest is Test {
    IrisVerifier public irisVerifier;
    IrisRegistry public registry;

    address public deployer = makeAddr("deployer");
    address public oracle = makeAddr("oracle");
    address public forwarder = makeAddr("forwarder");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    bytes32 public constant IRIS_1 = keccak256("iris_alice");
    uint256 public constant EXPIRATION_BLOCKS = 50;

    function setUp() public {
        vm.startPrank(deployer);
        registry = new IrisRegistry();
        irisVerifier = new IrisVerifier(registry, oracle, EXPIRATION_BLOCKS);
        irisVerifier.setKeystoneForwarder(forwarder);
        vm.stopPrank();

        // Register alice
        registry.registerWallet(alice, IRIS_1);
    }

    // =====================================================================
    // submitMatchResult (legacy oracle path)
    // =====================================================================

    function test_submitMatchResult() public {
        vm.prank(oracle);
        irisVerifier.submitMatchResult(alice, true, 95, 1);

        assertTrue(irisVerifier.hasValidMatch(alice));
    }

    function test_submitMatchResult_emitsEvent() public {
        vm.prank(oracle);
        vm.expectEmit(true, false, false, true);
        emit IrisVerifier.MatchResultSubmitted(alice, true, 95, 1);
        irisVerifier.submitMatchResult(alice, true, 95, 1);
    }

    function test_revert_submitMatchResult_notOracle() public {
        vm.prank(bob);
        vm.expectRevert(IrisVerifier.OnlyOracle.selector);
        irisVerifier.submitMatchResult(alice, true, 95, 1);
    }

    function test_revert_submitMatchResult_nonceReuse() public {
        vm.prank(oracle);
        irisVerifier.submitMatchResult(alice, true, 95, 1);

        vm.prank(oracle);
        vm.expectRevert(abi.encodeWithSelector(IrisVerifier.NonceAlreadyUsed.selector, 1));
        irisVerifier.submitMatchResult(alice, true, 95, 1);
    }

    function test_revert_submitMatchResult_walletNotRegistered() public {
        vm.prank(oracle);
        vm.expectRevert(abi.encodeWithSelector(IrisVerifier.WalletNotRegistered.selector, bob));
        irisVerifier.submitMatchResult(bob, true, 95, 1);
    }

    function test_revert_submitMatchResult_walletDeactivated() public {
        vm.prank(alice);
        registry.deactivateWallet(IRIS_1);

        vm.prank(oracle);
        vm.expectRevert(abi.encodeWithSelector(IrisVerifier.WalletNotActive.selector, alice));
        irisVerifier.submitMatchResult(alice, true, 95, 1);
    }

    // =====================================================================
    // onReport (Chainlink CRE / KeystoneForwarder path)
    // =====================================================================

    function test_onReport_success() public {
        bytes memory report = abi.encode(alice, true, uint256(92), uint256(100));
        bytes memory metadata = "";

        vm.prank(forwarder);
        irisVerifier.onReport(metadata, report);

        assertTrue(irisVerifier.hasValidMatch(alice));
    }

    function test_onReport_emitsReportReceived() public {
        bytes memory report = abi.encode(alice, true, uint256(92), uint256(101));
        bytes memory metadata = "";

        vm.prank(forwarder);
        vm.expectEmit(true, false, false, true);
        emit IrisVerifier.ReportReceived(alice, true, 92, 101);
        irisVerifier.onReport(metadata, report);
    }

    function test_onReport_emitsMatchResultSubmitted() public {
        bytes memory report = abi.encode(alice, true, uint256(88), uint256(102));
        bytes memory metadata = "";

        vm.prank(forwarder);
        vm.expectEmit(true, false, false, true);
        emit IrisVerifier.MatchResultSubmitted(alice, true, 88, 102);
        irisVerifier.onReport(metadata, report);
    }

    function test_revert_onReport_notForwarder() public {
        bytes memory report = abi.encode(alice, true, uint256(92), uint256(100));
        bytes memory metadata = "";

        vm.prank(bob);
        vm.expectRevert(IrisVerifier.OnlyForwarder.selector);
        irisVerifier.onReport(metadata, report);
    }

    function test_revert_onReport_nonceReuse() public {
        bytes memory report = abi.encode(alice, true, uint256(92), uint256(200));
        bytes memory metadata = "";

        vm.prank(forwarder);
        irisVerifier.onReport(metadata, report);

        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(IrisVerifier.NonceAlreadyUsed.selector, 200));
        irisVerifier.onReport(metadata, report);
    }

    function test_revert_onReport_walletNotRegistered() public {
        bytes memory report = abi.encode(bob, true, uint256(92), uint256(300));
        bytes memory metadata = "";

        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(IrisVerifier.WalletNotRegistered.selector, bob));
        irisVerifier.onReport(metadata, report);
    }

    function test_onReport_noMatch() public {
        bytes memory report = abi.encode(alice, false, uint256(15), uint256(400));
        bytes memory metadata = "";

        vm.prank(forwarder);
        irisVerifier.onReport(metadata, report);

        assertFalse(irisVerifier.hasValidMatch(alice));
    }

    // =====================================================================
    // approveTransaction
    // =====================================================================

    function test_approveTransaction() public {
        bytes32 txHash = keccak256("tx1");

        vm.prank(oracle);
        irisVerifier.submitMatchResult(alice, true, 95, 1);

        irisVerifier.approveTransaction(alice, txHash);

        assertTrue(irisVerifier.isTransactionApproved(alice, txHash));
    }

    function test_approveTransaction_afterOnReport() public {
        bytes32 txHash = keccak256("tx_cre");
        bytes memory report = abi.encode(alice, true, uint256(90), uint256(500));

        vm.prank(forwarder);
        irisVerifier.onReport("", report);

        irisVerifier.approveTransaction(alice, txHash);
        assertTrue(irisVerifier.isTransactionApproved(alice, txHash));
    }

    function test_approveTransaction_emitsEvent() public {
        bytes32 txHash = keccak256("tx1");

        vm.prank(oracle);
        irisVerifier.submitMatchResult(alice, true, 95, 1);

        vm.expectEmit(true, true, false, false);
        emit IrisVerifier.TransactionApproved(alice, txHash);
        irisVerifier.approveTransaction(alice, txHash);
    }

    function test_revert_approveTransaction_noMatch() public {
        bytes32 txHash = keccak256("tx1");

        vm.expectRevert(IrisVerifier.NoMatchResult.selector);
        irisVerifier.approveTransaction(alice, txHash);
    }

    function test_revert_approveTransaction_matchFailed() public {
        bytes32 txHash = keccak256("tx1");

        vm.prank(oracle);
        irisVerifier.submitMatchResult(alice, false, 10, 1);

        vm.expectRevert(IrisVerifier.MatchFailed.selector);
        irisVerifier.approveTransaction(alice, txHash);
    }

    function test_revert_approveTransaction_expired() public {
        bytes32 txHash = keccak256("tx1");

        vm.prank(oracle);
        irisVerifier.submitMatchResult(alice, true, 95, 1);

        vm.roll(block.number + EXPIRATION_BLOCKS + 1);

        vm.expectRevert(IrisVerifier.MatchExpired.selector);
        irisVerifier.approveTransaction(alice, txHash);
    }

    function test_approveTransaction_deletesMatch() public {
        bytes32 txHash = keccak256("tx1");

        vm.prank(oracle);
        irisVerifier.submitMatchResult(alice, true, 95, 1);

        irisVerifier.approveTransaction(alice, txHash);

        assertFalse(irisVerifier.hasValidMatch(alice));
    }

    // =====================================================================
    // hasValidMatch
    // =====================================================================

    function test_hasValidMatch_falseByDefault() public view {
        assertFalse(irisVerifier.hasValidMatch(alice));
    }

    function test_hasValidMatch_falseAfterExpiry() public {
        vm.prank(oracle);
        irisVerifier.submitMatchResult(alice, true, 95, 1);

        vm.roll(block.number + EXPIRATION_BLOCKS + 1);

        assertFalse(irisVerifier.hasValidMatch(alice));
    }

    function test_hasValidMatch_falseIfNotMatched() public {
        vm.prank(oracle);
        irisVerifier.submitMatchResult(alice, false, 10, 1);

        assertFalse(irisVerifier.hasValidMatch(alice));
    }

    // =====================================================================
    // isTransactionApproved
    // =====================================================================

    function test_isTransactionApproved_falseByDefault() public view {
        assertFalse(irisVerifier.isTransactionApproved(alice, keccak256("tx1")));
    }

    // =====================================================================
    // Admin
    // =====================================================================

    function test_setOracle() public {
        vm.prank(deployer);
        irisVerifier.setOracle(bob);
        assertEq(irisVerifier.oracle(), bob);
    }

    function test_revert_setOracle_notOwner() public {
        vm.prank(alice);
        vm.expectRevert(IrisVerifier.OnlyOwner.selector);
        irisVerifier.setOracle(bob);
    }

    function test_setExpirationBlocks() public {
        vm.prank(deployer);
        irisVerifier.setExpirationBlocks(100);
        assertEq(irisVerifier.expirationBlocks(), 100);
    }

    function test_revert_setExpirationBlocks_notOwner() public {
        vm.prank(alice);
        vm.expectRevert(IrisVerifier.OnlyOwner.selector);
        irisVerifier.setExpirationBlocks(100);
    }

    function test_setKeystoneForwarder() public {
        address newForwarder = makeAddr("newForwarder");
        vm.prank(deployer);
        vm.expectEmit(true, true, false, false);
        emit IrisVerifier.ForwarderUpdated(forwarder, newForwarder);
        irisVerifier.setKeystoneForwarder(newForwarder);
        assertEq(irisVerifier.keystoneForwarder(), newForwarder);
    }

    function test_revert_setKeystoneForwarder_notOwner() public {
        vm.prank(alice);
        vm.expectRevert(IrisVerifier.OnlyOwner.selector);
        irisVerifier.setKeystoneForwarder(bob);
    }
}
