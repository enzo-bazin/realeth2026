"""Configuration du serveur hardware IrisWallet."""

import os

# Flask
HOST = "0.0.0.0"
PORT = 5001
DEBUG = True

# Iris
IRISCODE_BITS = 2048
MATCH_THRESHOLD = 0.32  # Hamming distance max pour un match

# Chiffrement AES-256-GCM
AES_KEY_SIZE = 32  # 256 bits
AES_NONCE_SIZE = 12

# Cle AES partagee — en prod, a charger depuis une variable d'env ou un secret manager
# Les autres services (extension, backend) doivent utiliser la meme cle pour dechiffrer
AES_SHARED_KEY = os.environ.get("IRIS_AES_KEY", None)

# Camera — changeable via env var ou API /camera/set
# Ex: IRIS_CAMERA=2 python app.py  (pour utiliser /dev/video2)
CAMERA_INDEX = int(os.environ.get("IRIS_CAMERA", 0))
CAPTURE_WIDTH = 640
CAPTURE_HEIGHT = 480
