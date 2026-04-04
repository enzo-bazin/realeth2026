// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IrisMultisig} from "../src/IrisMultisig.sol";

contract IrisMultisigTest is Test {
    IrisMultisig public multisig;

    uint256 public irisKey = 0xA11CE;
    uint256 public ledgerKey = 0xB0B;
    address public irisOwner;
    address public ledgerOwner;
    address public recipient = makeAddr("recipient");

    function setUp() public {
        irisOwner = vm.addr(irisKey);
        ledgerOwner = vm.addr(ledgerKey);
        multisig = new IrisMultisig(irisOwner, ledgerOwner);
        vm.deal(address(multisig), 10 ether);
    }

    function _signMessage(address to, uint256 value, uint256 nonce_, uint256 privateKey) internal view returns (bytes memory) {
        bytes32 dataHash = keccak256(abi.encodePacked(to, value, nonce_, address(multisig)));
        bytes32 messageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", dataHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, messageHash);
        return abi.encodePacked(r, s, v);
    }

    function test_Constructor() public view {
        assertEq(multisig.irisOwner(), irisOwner);
        assertEq(multisig.ledgerOwner(), ledgerOwner);
        assertEq(multisig.nonce(), 0);
    }

    function test_ReceiveETH() public {
        vm.deal(address(this), 1 ether);
        (bool ok, ) = address(multisig).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(address(multisig).balance, 11 ether);
    }

    function test_ExecuteSuccess() public {
        uint256 balBefore = recipient.balance;

        bytes memory irisSig = _signMessage(recipient, 1 ether, 0, irisKey);
        bytes memory ledgerSig = _signMessage(recipient, 1 ether, 0, ledgerKey);

        multisig.execute(recipient, 1 ether, irisSig, ledgerSig);

        assertEq(recipient.balance, balBefore + 1 ether);
        assertEq(multisig.nonce(), 1);
    }

    function test_ExecuteIncrementsNonce() public {
        bytes memory irisSig = _signMessage(recipient, 1 ether, 0, irisKey);
        bytes memory ledgerSig = _signMessage(recipient, 1 ether, 0, ledgerKey);
        multisig.execute(recipient, 1 ether, irisSig, ledgerSig);

        // Second tx with nonce 1
        irisSig = _signMessage(recipient, 0.5 ether, 1, irisKey);
        ledgerSig = _signMessage(recipient, 0.5 ether, 1, ledgerKey);
        multisig.execute(recipient, 0.5 ether, irisSig, ledgerSig);

        assertEq(multisig.nonce(), 2);
        assertEq(recipient.balance, 1.5 ether);
    }

    function test_RevertOnInvalidIrisSignature() public {
        uint256 wrongKey = 0xDEAD;
        bytes memory badIrisSig = _signMessage(recipient, 1 ether, 0, wrongKey);
        bytes memory ledgerSig = _signMessage(recipient, 1 ether, 0, ledgerKey);

        vm.expectRevert(IrisMultisig.InvalidIrisSignature.selector);
        multisig.execute(recipient, 1 ether, badIrisSig, ledgerSig);
    }

    function test_RevertOnInvalidLedgerSignature() public {
        uint256 wrongKey = 0xDEAD;
        bytes memory irisSig = _signMessage(recipient, 1 ether, 0, irisKey);
        bytes memory badLedgerSig = _signMessage(recipient, 1 ether, 0, wrongKey);

        vm.expectRevert(IrisMultisig.InvalidLedgerSignature.selector);
        multisig.execute(recipient, 1 ether, irisSig, badLedgerSig);
    }

    function test_RevertOnReplayAttack() public {
        bytes memory irisSig = _signMessage(recipient, 1 ether, 0, irisKey);
        bytes memory ledgerSig = _signMessage(recipient, 1 ether, 0, ledgerKey);

        multisig.execute(recipient, 1 ether, irisSig, ledgerSig);

        // Same sigs with old nonce should fail
        vm.expectRevert(IrisMultisig.InvalidIrisSignature.selector);
        multisig.execute(recipient, 1 ether, irisSig, ledgerSig);
    }

    function test_RevertOnSwappedSignatures() public {
        bytes memory irisSig = _signMessage(recipient, 1 ether, 0, irisKey);
        bytes memory ledgerSig = _signMessage(recipient, 1 ether, 0, ledgerKey);

        // Swap: ledgerSig as iris, irisSig as ledger
        vm.expectRevert(IrisMultisig.InvalidIrisSignature.selector);
        multisig.execute(recipient, 1 ether, ledgerSig, irisSig);
    }

    function test_RevertOnInsufficientBalance() public {
        bytes memory irisSig = _signMessage(recipient, 100 ether, 0, irisKey);
        bytes memory ledgerSig = _signMessage(recipient, 100 ether, 0, ledgerKey);

        vm.expectRevert(IrisMultisig.ExecutionFailed.selector);
        multisig.execute(recipient, 100 ether, irisSig, ledgerSig);
    }

    function test_GetMessageHash() public view {
        bytes32 expected = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(recipient, uint256(1 ether), uint256(0), address(multisig)))
        ));
        assertEq(multisig.getMessageHash(recipient, 1 ether), expected);
    }

    function test_AnyoneCanCallExecute() public {
        bytes memory irisSig = _signMessage(recipient, 1 ether, 0, irisKey);
        bytes memory ledgerSig = _signMessage(recipient, 1 ether, 0, ledgerKey);

        // A random address submits the tx (relayer pattern)
        address relayer = makeAddr("relayer");
        vm.prank(relayer);
        multisig.execute(recipient, 1 ether, irisSig, ledgerSig);

        assertEq(recipient.balance, 1 ether);
    }
}
