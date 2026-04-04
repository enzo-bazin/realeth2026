const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3001;
const DB_PATH = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json());

function readDB() {
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function generateWalletAddress() {
  const bytes = crypto.randomBytes(20);
  return '0x' + bytes.toString('hex');
}

app.post('/api/auth', (req, res) => {
  const { irisHash } = req.body;

  if (!irisHash) {
    return res.status(400).json({ error: 'irisHash is required' });
  }

  const users = readDB();
  const user = users.find((u) => u.irisHash === irisHash);

  if (user) {
    return res.json({ found: true, wallet: user });
  }

  return res.json({ found: false });
});

app.post('/api/register', (req, res) => {
  const { irisHash, walletName } = req.body;

  if (!irisHash || !walletName) {
    return res.status(400).json({ error: 'irisHash and walletName are required' });
  }

  const users = readDB();
  const existing = users.find((u) => u.irisHash === irisHash);

  if (existing) {
    return res.status(409).json({ error: 'This iris is already registered', wallet: existing });
  }

  const newUser = {
    irisHash,
    walletName,
    walletAddress: generateWalletAddress(),
    balance: 0.00,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  writeDB(users);

  return res.status(201).json({ found: true, wallet: newUser });
});

app.listen(PORT, () => {
  console.log(`IrisWallet backend running on http://localhost:${PORT}`);
});
