# IrisWallet

Portefeuille blockchain authentifie par reconnaissance d'iris. Le systeme combine la biometrie de l'iris (algorithme open-iris de Worldcoin), des smart contracts Ethereum (Sepolia), une extension navigateur et un backend de traitement d'image.

## Architecture

```
iriswallet-extension/   Extension Chrome (React + TypeScript + Vite)
irisgate-backend/       API principale Flask (Python) - port 5000
hardware/               API capture iris (Python/Flask) - port 5001
iris-recognition/       Module de reconnaissance d'iris (Python + open-iris)
contracts/              Smart contracts Solidity (Foundry)
website/                Site vitrine Next.js - port 3000
fetch_picture/          Scripts de capture photo Raspberry Pi
```

## Pre-requis

- **Python 3.10+**
- **Node.js 18+** et npm
- **Foundry** (forge, cast, anvil) pour les smart contracts
- **Raspberry Pi 4** avec module camera (ou webcam USB en mode local)
- **Ledger** (optionnel, pour le multisig)

## Installation

### 1. Module de reconnaissance d'iris

```bash
cd iris-recognition
python3 -m venv venv
source venv/bin/activate
pip install "setuptools>=69"
pip install "pydantic>=1.10,<2"

# Installer open-iris (Worldcoin)
git clone --depth 1 https://github.com/worldcoin/open-iris.git
cd open-iris
sed -i 's/==/>=/' requirements/base.txt requirements/server.txt
IRIS_ENV=SERVER pip install -e .
cd ..

pip install -r requirements.txt
```

### 2. Backend principal (irisgate-backend)

```bash
cd irisgate-backend
pip install -r requirements.txt
```

### 3. API Hardware (optionnel)

```bash
cd hardware
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. Extension navigateur

```bash
cd iriswallet-extension
npm install
```

### 5. Site web

```bash
cd website
npm install
```

### 6. Smart contracts

```bash
cd contracts
forge install
cp .env.example .env
# Remplir les variables dans .env (voir section Configuration)
```

## Configuration

### Variables d'environnement

| Variable | Default | Description |
|---|---|---|
| `PI_USER` | `epitech` | Utilisateur SSH du Raspberry Pi |
| `PI_IP` | `10.105.174.149` | Adresse IP du Raspberry Pi |
| `PI_STREAM_PORT` | `8888` | Port du flux MJPEG |
| `PI_BURST_COUNT` | `5` | Nombre de photos par capture |
| `CAPTURE_MODE` | `remote` | `remote` (Pi) ou `local` (webcam USB) |
| `IRIS_CAMERA` | `0` | Index de la camera USB (mode local) |
| `IRIS_AES_KEY` | - | Cle AES-256 en base64 (chiffrement des templates) |
| `SEPOLIA_RPC_URL` | - | URL RPC Ethereum Sepolia |
| `ETHERSCAN_API_KEY` | - | Cle API Etherscan |
| `DEPLOYER_PRIVATE_KEY` | - | Cle privee pour le deploiement des contrats |

### Configuration Raspberry Pi

Le Pi doit etre accessible en SSH sans mot de passe :

```bash
ssh-keygen
ssh-copy-id epitech@10.105.174.149
```

## Lancement

Ouvrir un terminal par service :

### Terminal 1 - Backend principal

```bash
cd irisgate-backend
python app.py
# Ecoute sur http://localhost:5000
```

### Terminal 2 - API Hardware (optionnel)

```bash
cd hardware
source venv/bin/activate
python app.py
# Ecoute sur http://localhost:5001
```

### Terminal 3 - Site web (optionnel)

```bash
cd website
npm run dev
# Ecoute sur http://localhost:3000
```

### Terminal 4 - Extension (developpement)

```bash
cd iriswallet-extension
npm run dev
# Vite dev server sur http://localhost:5173
```

### Charger l'extension dans Chrome

1. Compiler l'extension :
   ```bash
   cd iriswallet-extension
   npm run build
   ```
2. Ouvrir Chrome et aller sur `chrome://extensions/`
3. Activer le **Mode developpeur** (en haut a droite)
4. Cliquer sur **Charger l'extension non empaquetee**
5. Selectionner le dossier `iriswallet-extension/dist/`
6. L'icone IrisWallet apparait dans la barre d'extensions

## Smart Contracts

### Build et tests

```bash
cd contracts
forge build
forge test -v
```

### Deploiement local (Anvil)

```bash
# Terminal A
anvil

# Terminal B
cd contracts
source .env
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

### Deploiement sur Sepolia

```bash
cd contracts
source .env
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast
```

### Contrats deployes (Sepolia)

| Contrat | Adresse |
|---|---|
| IrisRegistry | `0xc48326f0031DeCbd53CF97835382C638E83f2785` |
| IrisVerifier | `0x8a5F9475e329375fbE17a2766c43c9EFd165C645` |

## Utilisation

### Flux principal

1. **Ouvrir l'extension** IrisWallet dans Chrome
2. **Scanner l'iris** - l'extension appelle le backend qui capture une photo via le Raspberry Pi et effectue la reconnaissance
3. **Iris reconnu** -> Acces au dashboard du portefeuille (solde, transactions)
4. **Iris inconnu** -> Ecran d'enregistrement pour creer un nouveau portefeuille
5. **Envoyer une transaction** -> Signer avec l'iris et/ou le Ledger (multisig)

### Endpoints API principaux

| Methode | Route | Description |
|---|---|---|
| `POST` | `/api/scan` | Scanner un iris et identifier le portefeuille |
| `POST` | `/api/register` | Enregistrer un nouvel iris avec un portefeuille |
| `GET` | `/api/accounts` | Lister tous les comptes enregistres |
| `GET` | `/stream` | Flux video MJPEG de la camera Pi |

## Stack technique

- **Reconnaissance d'iris** : open-iris (Worldcoin), distance de Hamming, seuil 0.35
- **Backend** : Flask, SQLite, OpenCV
- **Extension** : React 18, TypeScript, Vite, Viem (Web3)
- **Blockchain** : Solidity 0.8.28, Foundry, Ethereum Sepolia
- **Hardware** : Raspberry Pi 4, chiffrement AES-256-GCM
- **Wallet hardware** : Ledger (WebHID/WebUSB)
