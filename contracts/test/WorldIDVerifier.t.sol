// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {WorldIDVerifier} from "../src/WorldIDVerifier.sol";
import {IWorldID} from "@worldcoin/interfaces/IWorldID.sol";

contract MockWorldID is IWorldID {
    bool public shouldRevert;

    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    function verifyProof(
        uint256,
        uint256,
        uint256,
        uint256,
        uint256[8] calldata
    ) external view override {
        if (shouldRevert) {
            revert("Invalid proof");
        }
    }
}

contract WorldIDVerifierTest is Test {
    WorldIDVerifier public verifier;
    MockWorldID public mockWorldId;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    uint256 public constant NULLIFIER_1 = 12345;
    uint256 public constant NULLIFIER_2 = 67890;
    uint256[8] public dummyProof;

    function setUp() public {
        mockWorldId = new MockWorldID();
        verifier = new WorldIDVerifier(IWorldID(address(mockWorldId)), "app_iriswallet", "create-iris-wallet");
    }

    function test_verifyAndRegister() public {
        verifier.verifyAndRegister(alice, 1, NULLIFIER_1, dummyProof);

        assertEq(verifier.nullifierToWallet(NULLIFIER_1), alice);
        assertEq(verifier.walletToNullifier(alice), NULLIFIER_1);
        assertTrue(verifier.isRegistered(alice));
        assertEq(verifier.getWallet(NULLIFIER_1), alice);
    }

    function test_verifyAndRegister_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit WorldIDVerifier.WalletRegistered(alice, NULLIFIER_1);
        verifier.verifyAndRegister(alice, 1, NULLIFIER_1, dummyProof);
    }

    function test_revert_duplicateNullifier() public {
        verifier.verifyAndRegister(alice, 1, NULLIFIER_1, dummyProof);

        vm.expectRevert(abi.encodeWithSelector(WorldIDVerifier.DuplicateNullifier.selector, NULLIFIER_1));
        verifier.verifyAndRegister(bob, 1, NULLIFIER_1, dummyProof);
    }

    function test_revert_walletAlreadyRegistered() public {
        verifier.verifyAndRegister(alice, 1, NULLIFIER_1, dummyProof);

        vm.expectRevert(abi.encodeWithSelector(WorldIDVerifier.WalletAlreadyRegistered.selector, alice));
        verifier.verifyAndRegister(alice, 1, NULLIFIER_2, dummyProof);
    }

    function test_revert_invalidProof() public {
        mockWorldId.setShouldRevert(true);

        vm.expectRevert("Invalid proof");
        verifier.verifyAndRegister(alice, 1, NULLIFIER_1, dummyProof);
    }

    function test_isRegistered_falseByDefault() public view {
        assertFalse(verifier.isRegistered(alice));
    }

    function test_getWallet_zeroByDefault() public view {
        assertEq(verifier.getWallet(NULLIFIER_1), address(0));
    }

    function test_twoUsersCanRegister() public {
        verifier.verifyAndRegister(alice, 1, NULLIFIER_1, dummyProof);
        verifier.verifyAndRegister(bob, 1, NULLIFIER_2, dummyProof);

        assertEq(verifier.nullifierToWallet(NULLIFIER_1), alice);
        assertEq(verifier.nullifierToWallet(NULLIFIER_2), bob);
        assertTrue(verifier.isRegistered(alice));
        assertTrue(verifier.isRegistered(bob));
    }
}
