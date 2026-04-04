// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IrisRegistry} from "../src/IrisRegistry.sol";
import {WorldIDVerifier} from "../src/WorldIDVerifier.sol";
import {IWorldID} from "@worldcoin/interfaces/IWorldID.sol";

contract MockWorldID is IWorldID {
    function verifyProof(uint256, uint256, uint256, uint256, uint256[8] calldata) external pure override {}
}

contract IrisRegistryTest is Test {
    IrisRegistry public registry;
    WorldIDVerifier public verifier;
    MockWorldID public mockWorldId;

    address public deployer = makeAddr("deployer");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    uint256 public constant NULLIFIER_1 = 12345;
    uint256 public constant NULLIFIER_2 = 67890;
    uint256[8] public dummyProof;

    function setUp() public {
        vm.startPrank(deployer);
        mockWorldId = new MockWorldID();
        verifier = new WorldIDVerifier(IWorldID(address(mockWorldId)), "app_iriswallet", "create-iris-wallet");
        registry = new IrisRegistry(verifier);
        vm.stopPrank();
    }

    function test_registerWallet() public {
        registry.registerWallet(alice, 1, NULLIFIER_1, dummyProof);

        IrisRegistry.WalletInfo memory info = registry.getWallet(NULLIFIER_1);
        assertEq(info.wallet, alice);
        assertTrue(info.active);
        assertGt(info.registeredAt, 0);
        assertTrue(registry.isRegistered(NULLIFIER_1));
        assertTrue(registry.isActive(NULLIFIER_1));
        assertEq(registry.totalRegistered(), 1);
    }

    function test_registerWallet_emitsEvent() public {
        vm.expectEmit(true, true, false, false);
        emit IrisRegistry.WalletRegistered(NULLIFIER_1, alice);
        registry.registerWallet(alice, 1, NULLIFIER_1, dummyProof);
    }

    function test_revert_doubleRegistration() public {
        registry.registerWallet(alice, 1, NULLIFIER_1, dummyProof);

        vm.expectRevert(abi.encodeWithSelector(IrisRegistry.AlreadyRegistered.selector, NULLIFIER_1));
        registry.registerWallet(bob, 1, NULLIFIER_1, dummyProof);
    }

    function test_deactivateWallet() public {
        registry.registerWallet(alice, 1, NULLIFIER_1, dummyProof);

        vm.prank(alice);
        registry.deactivateWallet(NULLIFIER_1);

        assertFalse(registry.isActive(NULLIFIER_1));
        assertTrue(registry.isRegistered(NULLIFIER_1));
    }

    function test_deactivateWallet_byOwner() public {
        registry.registerWallet(alice, 1, NULLIFIER_1, dummyProof);

        vm.prank(deployer);
        registry.deactivateWallet(NULLIFIER_1);

        assertFalse(registry.isActive(NULLIFIER_1));
    }

    function test_revert_deactivate_notOwnerOrWallet() public {
        registry.registerWallet(alice, 1, NULLIFIER_1, dummyProof);

        vm.prank(bob);
        vm.expectRevert(IrisRegistry.OnlyOwnerOrWallet.selector);
        registry.deactivateWallet(NULLIFIER_1);
    }

    function test_revert_deactivate_alreadyDeactivated() public {
        registry.registerWallet(alice, 1, NULLIFIER_1, dummyProof);

        vm.prank(alice);
        registry.deactivateWallet(NULLIFIER_1);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IrisRegistry.AlreadyDeactivated.selector, NULLIFIER_1));
        registry.deactivateWallet(NULLIFIER_1);
    }

    function test_reactivateWallet() public {
        registry.registerWallet(alice, 1, NULLIFIER_1, dummyProof);

        vm.prank(alice);
        registry.deactivateWallet(NULLIFIER_1);
        assertFalse(registry.isActive(NULLIFIER_1));

        vm.prank(alice);
        registry.reactivateWallet(NULLIFIER_1);
        assertTrue(registry.isActive(NULLIFIER_1));
    }

    function test_revert_reactivate_alreadyActive() public {
        registry.registerWallet(alice, 1, NULLIFIER_1, dummyProof);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IrisRegistry.AlreadyActive.selector, NULLIFIER_1));
        registry.reactivateWallet(NULLIFIER_1);
    }

    function test_revert_deactivate_notRegistered() public {
        vm.prank(deployer);
        vm.expectRevert(abi.encodeWithSelector(IrisRegistry.NotRegistered.selector, NULLIFIER_1));
        registry.deactivateWallet(NULLIFIER_1);
    }

    function test_isRegistered_falseByDefault() public view {
        assertFalse(registry.isRegistered(NULLIFIER_1));
    }

    function test_multipleRegistrations() public {
        registry.registerWallet(alice, 1, NULLIFIER_1, dummyProof);
        registry.registerWallet(bob, 1, NULLIFIER_2, dummyProof);

        assertEq(registry.totalRegistered(), 2);
        assertTrue(registry.isRegistered(NULLIFIER_1));
        assertTrue(registry.isRegistered(NULLIFIER_2));
    }
}
