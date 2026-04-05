# IrisWallet

Blockchain wallet authenticated by iris recognition. The system combines iris biometrics (Worldcoin's open-iris algorithm), Ethereum smart contracts (Sepolia), a browser extension and an image processing backend.

## Architecture

```
iriswallet-extension/   Chrome extension (React + TypeScript + Vite)
irisgate-backend/       Main Flask API backend (Python) - port 5000
hardware/               Iris capture API (Python/Flask) - port 5001
iris-recognition/       Iris recognition module (Python + open-iris)
contracts/              Solidity smart contracts (Foundry)
website/                Landing page (Next.js) - port 3000
fetch_picture/          Raspberry Pi photo capture scripts
```

## Prerequisites

- **Python 3.10+**
- **Node.js 18+** and npm
- **Foundry** (forge, cast, anvil) for smart contracts
- **Raspberry Pi 4** with camera module (or USB webcam in local mode)
- **Ledger** (optional, for multisig)

## Installation

### 1. Iris recognition module

```bash
cd iris-recognition
python3 -m venv venv
source venv/bin/activate
pip install "setuptools>=69"
pip install "pydantic>=1.10,<2"

# Install open-iris (Worldcoin)
git clone --depth 1 https://github.com/worldcoin/open-iris.git
cd open-iris
sed -i 's/==/>=/' requirements/base.txt requirements/server.txt
IRIS_ENV=SERVER pip install -e .
cd ..

pip install -r requirements.txt
```

### 2. Main backend (irisgate-backend)

```bash
cd irisgate-backend
pip install -r requirements.txt
```

### 3. Hardware API (optional)

```bash
cd hardware
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. Browser extension

```bash
cd iriswallet-extension
npm install
```

### 5. Website

```bash
cd website
npm install
```

### 6. Smart contracts

```bash
cd contracts
forge install
cp .env.example .env
# Fill in the variables in .env (see Configuration section)
```

## Configuration

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PI_USER` | `epitech` | Raspberry Pi SSH username |
| `PI_IP` | `10.105.174.149` | Raspberry Pi IP address |
| `PI_STREAM_PORT` | `8888` | MJPEG stream port |
| `PI_BURST_COUNT` | `5` | Number of photos per capture burst |
| `CAPTURE_MODE` | `remote` | `remote` (Pi) or `local` (USB webcam) |
| `IRIS_CAMERA` | `0` | USB camera index (local mode) |
| `IRIS_AES_KEY` | - | Base64-encoded AES-256 key (template encryption) |
| `SEPOLIA_RPC_URL` | - | Ethereum Sepolia RPC URL |
| `ETHERSCAN_API_KEY` | - | Etherscan API key |
| `DEPLOYER_PRIVATE_KEY` | - | Private key for contract deployment |

### Raspberry Pi setup

The Pi must be accessible via passwordless SSH:

```bash
ssh-keygen
ssh-copy-id epitech@10.105.174.149
```

## Running

Open one terminal per service:

### Terminal 1 - Main backend

```bash
cd irisgate-backend
python app.py
# Listening on http://localhost:5000
```

### Terminal 2 - Hardware API (optional)

```bash
cd hardware
source venv/bin/activate
python app.py
# Listening on http://localhost:5001
```

### Terminal 3 - Website (optional)

```bash
cd website
npm run dev
# Listening on http://localhost:3000
```

### Terminal 4 - Extension (development)

```bash
cd iriswallet-extension
npm run dev
# Vite dev server on http://localhost:5173
```

### Loading the extension in Chrome

1. Build the extension:
   ```bash
   cd iriswallet-extension
   npm run build
   ```
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the `iriswallet-extension/dist/` folder
6. The IrisWallet icon appears in the extensions bar

## Smart Contracts

### Build and test

```bash
cd contracts
forge build
forge test -v
```

### Local deployment (Anvil)

```bash
# Terminal A
anvil

# Terminal B
cd contracts
source .env
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

### Sepolia deployment

```bash
cd contracts
source .env
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast
```

### Deployed contracts (Sepolia)

| Contract | Address |
|---|---|
| IrisRegistry | `0xc48326f0031DeCbd53CF97835382C638E83f2785` |
| IrisVerifier | `0x8a5F9475e329375fbE17a2766c43c9EFd165C645` |

## Usage

### Main flow

1. **Open the extension** IrisWallet in Chrome
2. **Scan iris** - the extension calls the backend which captures a photo via the Raspberry Pi and performs recognition
3. **Iris recognized** -> Access the wallet dashboard (balance, transactions)
4. **Iris unknown** -> Registration screen to create a new wallet
5. **Send a transaction** -> Sign with iris and/or Ledger (multisig)

### Main API endpoints

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/scan` | Scan an iris and identify the wallet |
| `POST` | `/api/register` | Register a new iris with a wallet |
| `GET` | `/api/accounts` | List all registered accounts |
| `GET` | `/stream` | MJPEG video stream from Pi camera |

## Tech stack

- **Iris recognition**: open-iris (Worldcoin), Hamming distance, threshold 0.35
- **Backend**: Flask, SQLite, OpenCV
- **Extension**: React 18, TypeScript, Vite, Viem (Web3)
- **Blockchain**: Solidity 0.8.28, Foundry, Ethereum Sepolia
- **Hardware**: Raspberry Pi 4, AES-256-GCM encryption
- **Hardware wallet**: Ledger (WebHID/WebUSB)
