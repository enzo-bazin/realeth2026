// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {WorldIDVerifier} from "../src/WorldIDVerifier.sol";
import {IrisRegistry} from "../src/IrisRegistry.sol";
import {IrisVerifier} from "../src/IrisVerifier.sol";
import {IWorldID} from "@worldcoin/interfaces/IWorldID.sol";

contract Deploy is Script {
    // World Chain Sepolia World ID Router
    // Update this address with the actual deployed World ID Router on your target chain
    // World ID Router on World Chain Sepolia
    // Mainnet: 0x17B354dD2595411ff79041f930e491A4Df39A278
    address constant WORLD_ID_ROUTER = 0x57f928158C3EE7CDad1e4D8642503c4D0201f611;

    string constant APP_ID = "app_iriswallet";
    string constant ACTION_ID = "create-iris-wallet";
    uint256 constant EXPIRATION_BLOCKS = 50;

    function run() external {
        address oracle = vm.envAddress("ORACLE_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy WorldIDVerifier
        WorldIDVerifier worldIdVerifier = new WorldIDVerifier(
            IWorldID(WORLD_ID_ROUTER),
            APP_ID,
            ACTION_ID
        );
        console.log("WorldIDVerifier deployed at:", address(worldIdVerifier));

        // 2. Deploy IrisRegistry
        IrisRegistry irisRegistry = new IrisRegistry(worldIdVerifier);
        console.log("IrisRegistry deployed at:", address(irisRegistry));

        // 3. Deploy IrisVerifier
        IrisVerifier irisVerifier = new IrisVerifier(irisRegistry, oracle, EXPIRATION_BLOCKS);
        console.log("IrisVerifier deployed at:", address(irisVerifier));

        vm.stopBroadcast();

        // Summary
        console.log("\n=== DEPLOYMENT SUMMARY ===");
        console.log("Chain:", block.chainid);
        console.log("WorldIDVerifier:", address(worldIdVerifier));
        console.log("IrisRegistry:   ", address(irisRegistry));
        console.log("IrisVerifier:   ", address(irisVerifier));
        console.log("Oracle:         ", oracle);
        console.log("Expiration:     ", EXPIRATION_BLOCKS, "blocks");
    }
}
