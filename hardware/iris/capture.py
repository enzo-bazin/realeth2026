"""Capture d'image iris via la camera avec detection automatique de l'oeil."""

import cv2
import numpy as np
import os
import subprocess
import tempfile
import glob as glob_module

import config

# Charger le classificateur Haar pour la detection des yeux
_CASCADE_PATH = os.path.join(
    cv2.data.haarcascades, "haarcascade_eye.xml"
)
_eye_cascade = cv2.CascadeClassifier(_CASCADE_PATH)

# Seuils de qualite
MIN_CONTRAST = 30.0     # ecart-type minimum des pixels
MIN_SHARPNESS = 20.0    # score Laplacien minimum (baisse car calcule sur zone iris centrale)
MIN_BRIGHTNESS = 40     # moyenne de pixels minimum
MAX_BRIGHTNESS = 220    # moyenne de pixels maximum


def list_cameras(max_index: int = 10) -> list[dict]:
    """Scanne les devices camera disponibles (index 0 a max_index).

    Retourne une liste de dicts avec l'index et les infos de chaque camera.
    """
    cameras = []
    for i in range(max_index):
        cap = cv2.VideoCapture(i)
        if cap.isOpened():
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = int(cap.get(cv2.CAP_PROP_FPS))
            backend = cap.getBackendName()
            cameras.append({
                "index": i,
                "resolution": f"{w}x{h}",
                "fps": fps,
                "backend": backend,
                "active": i == config.CAMERA_INDEX,
            })
            cap.release()
    return cameras


def is_camera_available() -> bool:
    """Verifie si la camera active est accessible."""
    cap = cv2.VideoCapture(config.CAMERA_INDEX)
    available = cap.isOpened()
    cap.release()
    return available


def compute_quality_score(image: np.ndarray) -> dict:
    """Evalue la qualite d'une image d'oeil.

    Retourne un dict avec les metriques et un booleen 'acceptable'.
    """
    brightness = float(np.mean(image))
    contrast = float(np.std(image))

    # Sharpness sur la zone centrale (iris) pour eviter que peau/cils diluent le score
    h, w = image.shape[:2]
    cx, cy = w // 2, h // 2
    r = min(cx, cy) // 2
    iris_region = image[max(0, cy - r):cy + r, max(0, cx - r):cx + r]
    sharpness = float(cv2.Laplacian(iris_region, cv2.CV_64F).var())

    acceptable = (
        contrast >= MIN_CONTRAST
        and sharpness >= MIN_SHARPNESS
        and MIN_BRIGHTNESS <= brightness <= MAX_BRIGHTNESS
    )

    return {
        "brightness": round(brightness, 1),
        "contrast": round(contrast, 1),
        "sharpness": round(sharpness, 1),
        "acceptable": acceptable,
    }


def _has_pupil(crop: np.ndarray) -> bool:
    """Verifie qu'un crop contient bien une pupille (zone sombre au centre)."""
    h, w = crop.shape[:2]
    # Zone centrale (40% du crop)
    cx, cy = w // 2, h // 2
    rx, ry = w // 5, h // 5
    center = crop[max(0, cy - ry):cy + ry, max(0, cx - rx):cx + rx]
    if center.size == 0:
        return False
    # La zone centrale doit etre plus sombre que les bords
    border_mean = (np.mean(crop[:ry, :]) + np.mean(crop[-ry:, :]) +
                   np.mean(crop[:, :rx]) + np.mean(crop[:, -rx:])) / 4
    center_mean = np.mean(center)
    # La pupille est sombre -> le centre doit etre nettement plus sombre que les bords
    return center_mean < border_mean * 0.85


def detect_best_eye(gray_frame: np.ndarray) -> np.ndarray | None:
    """Detecte les yeux dans l'image et retourne le crop du meilleur oeil.

    Utilise le Haar Cascade haarcascade_eye.xml + verification de pupille
    pour filtrer les faux positifs (sourcils, coins d'oeil, peau).
    Retourne l'image croppee en niveaux de gris ou None si aucun oeil detecte.
    """
    eyes = _eye_cascade.detectMultiScale(
        gray_frame,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(40, 40),
    )

    if len(eyes) == 0:
        return None

    # Trier par taille decroissante et prendre le premier qui a une pupille
    sorted_eyes = sorted(eyes, key=lambda e: e[2] * e[3], reverse=True)

    for (x, y, w, h) in sorted_eyes:
        # Crop sans marge pour le test pupille
        crop = gray_frame[y:y + h, x:x + w]
        if not _has_pupil(crop):
            continue

        # Bon candidat — ajouter la marge pour le crop final
        margin_x = int(w * 0.6)
        margin_y = int(h * 0.6)
        x1 = max(0, x - margin_x)
        y1 = max(0, y - margin_y)
        x2 = min(gray_frame.shape[1], x + w + margin_x)
        y2 = min(gray_frame.shape[0], y + h + margin_y)

        return gray_frame[y1:y2, x1:x2]

    return None


def _capture_remote_frames() -> list[np.ndarray]:
    """Capture des photos en rafale sur le Raspberry Pi via SSH.

    Retourne une liste d'images (grayscale numpy arrays).
    """
    pi = f"{config.PI_USER}@{config.PI_IP}"
    count = config.PI_BURST_COUNT
    remote_dir = config.PI_PHOTO_DIR

    # Lancer le script de capture en rafale sur le Pi
    ssh_cmd = [
        "ssh", pi,
        f"bash {config.PI_CAPTURE_SCRIPT} {count} {remote_dir}"
    ]
    result = subprocess.run(ssh_cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        print(f"[REMOTE] SSH capture failed: {result.stderr}")
        return []

    # Rapatrier toutes les photos en une seule commande scp
    local_tmp = tempfile.mkdtemp(prefix="iris_burst_")
    scp_cmd = [
        "scp", f"{pi}:{remote_dir}/burst_*.jpg", local_tmp
    ]
    result = subprocess.run(scp_cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        print(f"[REMOTE] SCP failed: {result.stderr}")
        return []

    # Charger les images en grayscale
    frames = []
    for path in sorted(glob_module.glob(os.path.join(local_tmp, "burst_*.jpg"))):
        img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
        if img is not None:
            frames.append(img)
        os.remove(path)
    os.rmdir(local_tmp)

    print(f"[REMOTE] Got {len(frames)} frames from Pi")
    return frames


def _capture_local_frames() -> list[np.ndarray]:
    """Capture des frames depuis une camera locale via OpenCV."""
    cap = cv2.VideoCapture(config.CAMERA_INDEX)
    if not cap.isOpened():
        return []

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, config.CAPTURE_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config.CAPTURE_HEIGHT)

    frames = []
    for _ in range(5):
        ret, frame = cap.read()
        if not ret:
            continue
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        frames.append(gray)

    cap.release()
    return frames


def capture_eye_image() -> tuple[np.ndarray | None, dict, list[np.ndarray]]:
    """Capture une image de l'oeil depuis la camera.

    Utilise le mode configure dans config.CAPTURE_MODE :
    - "remote" : capture en rafale sur le Raspberry Pi via SSH
    - "local"  : capture depuis une webcam locale via OpenCV

    Detecte automatiquement l'oeil, crop dessus, et evalue la qualite.
    Retourne (image_croppee, quality_info, eye_frames) ou (None, quality_info, []) si echec.
    """
    if config.CAPTURE_MODE == "remote":
        raw_frames = _capture_remote_frames()
        if not raw_frames:
            return None, {"error": "remote_capture_failed (Pi unreachable or no photos)"}, []
    else:
        raw_frames = _capture_local_frames()
        if not raw_frames:
            return None, {"error": f"camera_unavailable (index={config.CAMERA_INDEX})"}, []

    best_eye = None
    best_score = -1.0
    best_quality = {}
    eye_frames = []

    for gray in raw_frames:
        eye_crop = detect_best_eye(gray)

        if eye_crop is None:
            continue

        eye_frames.append(eye_crop)

        quality = compute_quality_score(eye_crop)
        if not quality["acceptable"]:
            continue

        score = quality["sharpness"] + quality["contrast"]
        if score > best_score:
            best_score = score
            best_eye = eye_crop
            best_quality = quality

    if best_eye is None:
        return None, {"error": "no_eye_detected"}, []

    return best_eye, best_quality, eye_frames
