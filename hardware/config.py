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

# Raspberry Pi (capture distante via SSH)
PI_USER = os.environ.get("PI_USER", "epitech")
PI_IP = os.environ.get("PI_IP", "10.105.174.149")
PI_CAPTURE_SCRIPT = "/home/epitech/Desktop/capture_burst.sh"
PI_PHOTO_DIR = "/home/epitech/Desktop/burst_photos"
# Nombre de photos a prendre en rafale (pas de flux continu)
PI_BURST_COUNT = int(os.environ.get("PI_BURST_COUNT", "5"))
# Mode de capture : "local" (webcam USB) ou "remote" (Raspberry Pi SSH)
CAPTURE_MODE = os.environ.get("CAPTURE_MODE", "remote")
