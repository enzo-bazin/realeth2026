// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IrisVerifier} from "../src/IrisVerifier.sol";
import {IrisRegistry} from "../src/IrisRegistry.sol";
import {WorldIDVerifier} from "../src/WorldIDVerifier.sol";
import {IWorldID} from "@worldcoin/interfaces/IWorldID.sol";

contract MockWorldID is IWorldID {
    function verifyProof(uint256, uint256, uint256, uint256, uint256[8] calldata) external pure override {}
}

contract IrisVerifierTest is Test {
    IrisVerifier public irisVerifier;
    IrisRegistry public registry;
    WorldIDVerifier public worldVerifier;
    MockWorldID public mockWorldId;

    address public deployer = makeAddr("deployer");
    address public oracle = makeAddr("oracle");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    uint256 public constant NULLIFIER_1 = 12345;
    uint256 public constant EXPIRATION_BLOCKS = 50;
    uint256[8] public dummyProof;

    function setUp() public {
        vm.startPrank(deployer);
        mockWorldId = new MockWorldID();
        worldVerifier = new WorldIDVerifier(IWorldID(address(mockWorldId)), "app_iriswallet", "create-iris-wallet");
        registry = new IrisRegistry(worldVerifier);
        irisVerifier = new IrisVerifier(registry, oracle, EXPIRATION_BLOCKS);
        vm.stopPrank();

        // Register alice
        registry.registerWallet(alice, 1, NULLIFIER_1, dummyProof);
    }

    // --- submitMatchResult ---

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
        registry.deactivateWallet(NULLIFIER_1);

        vm.prank(oracle);
        vm.expectRevert(abi.encodeWithSelector(IrisVerifier.WalletNotActive.selector, alice));
        irisVerifier.submitMatchResult(alice, true, 95, 1);
    }

    // --- approveTransaction ---

    function test_approveTransaction() public {
        bytes32 txHash = keccak256("tx1");

        vm.prank(oracle);
        irisVerifier.submitMatchResult(alice, true, 95, 1);

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

    // --- hasValidMatch ---

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

    // --- isTransactionApproved ---

    function test_isTransactionApproved_falseByDefault() public view {
        assertFalse(irisVerifier.isTransactionApproved(alice, keccak256("tx1")));
    }

    // --- Admin ---

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
}
