"""Traitement de l'iris : segmentation, normalisation, encodage IrisCode."""

import numpy as np
import cv2

from config import IRISCODE_BITS


def detect_pupil_iris(image: np.ndarray) -> tuple[tuple, tuple] | None:
    """Detecte les cercles de la pupille et de l'iris via Hough Transform.

    La pupille est detectee d'abord (zone la plus sombre au centre).
    L'iris est ensuite cherche comme un cercle concentrique autour de la pupille.

    Retourne ((px, py, pr), (ix, iy, ir)) ou None si echec.
    """
    h, w = image.shape[:2]
    blurred = cv2.GaussianBlur(image, (7, 7), 0)

    # --- Pupille : cercle sombre ---
    # Adapter les rayons a la taille de l'image
    min_r_pupil = max(10, min(h, w) // 30)
    max_r_pupil = max(30, min(h, w) // 5)

    pupils = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=max(50, min(h, w) // 4),
        param1=100,
        param2=35,
        minRadius=min_r_pupil,
        maxRadius=max_r_pupil,
    )

    if pupils is None:
        return None

    # Choisir la pupille la plus sombre (plus proche du centre de l'image)
    best_pupil = None
    best_darkness = 999.0
    cx_img, cy_img = w // 2, h // 2

    for p in pupils[0]:
        px, py, pr = int(round(p[0])), int(round(p[1])), int(round(p[2]))
        # Masque circulaire pour mesurer l'intensite moyenne
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.circle(mask, (px, py), max(1, pr // 2), 255, -1)
        mean_val = cv2.mean(blurred, mask=mask)[0]
        # Penaliser les pupilles loin du centre de l'image
        dist_center = np.sqrt((px - cx_img) ** 2 + (py - cy_img) ** 2)
        score = mean_val + dist_center * 0.3
        if score < best_darkness:
            best_darkness = score
            best_pupil = (px, py, pr)

    if best_pupil is None:
        return None

    px, py, pr = best_pupil

    # --- Iris : cercle concentrique autour de la pupille ---
    # Chercher l'iris dans une ROI autour de la pupille
    margin = pr * 5
    x1_roi = max(0, px - margin)
    y1_roi = max(0, py - margin)
    x2_roi = min(w, px + margin)
    y2_roi = min(h, py + margin)
    roi = blurred[y1_roi:y2_roi, x1_roi:x2_roi]

    if roi.size == 0:
        return None

    min_r_iris = pr + 10
    max_r_iris = min(pr * 5, min(roi.shape[0], roi.shape[1]) // 2)

    if max_r_iris <= min_r_iris:
        return None

    iris_circles = cv2.HoughCircles(
        roi,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=max(50, min_r_iris),
        param1=100,
        param2=30,
        minRadius=min_r_iris,
        maxRadius=max_r_iris,
    )

    if iris_circles is None:
        return None

    # Choisir le cercle iris le plus concentrique a la pupille
    px_roi = px - x1_roi
    py_roi = py - y1_roi
    best_iris = None
    best_dist = float('inf')

    for c in iris_circles[0]:
        ix, iy, ir = int(round(c[0])), int(round(c[1])), int(round(c[2]))
        dist = np.sqrt((ix - px_roi) ** 2 + (iy - py_roi) ** 2)
        # L'iris doit etre a peu pres concentrique (distance < rayon pupille)
        if dist < pr * 1.5 and dist < best_dist:
            best_dist = dist
            best_iris = (ix + x1_roi, iy + y1_roi, ir)

    if best_iris is None:
        return None

    return best_pupil, best_iris


def normalize_iris(
    image: np.ndarray,
    pupil: tuple[int, int, int],
    iris: tuple[int, int, int],
    radial_res: int = 64,
    angular_res: int = 512,
) -> np.ndarray:
    """Normalise l'iris en coordonnees polaires (Daugman rubber sheet model).

    Retourne une image 2D (radial_res x angular_res) representant l'iris deplie.
    """
    px, py, pr = pupil
    ix, iy, ir = iris

    normalized = np.zeros((radial_res, angular_res), dtype=np.uint8)
    thetas = np.linspace(0, 2 * np.pi, angular_res, endpoint=False)

    for j, theta in enumerate(thetas):
        for i in range(radial_res):
            r = i / radial_res
            x = int((1 - r) * (px + pr * np.cos(theta)) + r * (ix + ir * np.cos(theta)))
            y = int((1 - r) * (py + pr * np.sin(theta)) + r * (iy + ir * np.sin(theta)))

            if 0 <= x < image.shape[1] and 0 <= y < image.shape[0]:
                normalized[i, j] = image[y, x]

    return normalized


def encode_iriscode(normalized_iris: np.ndarray) -> np.ndarray:
    """Encode l'iris normalise en IrisCode via filtres de Gabor 2D (methode Daugman).

    Utilise la partie reelle et imaginaire (phase) des filtres de Gabor.
    Le signe de chaque composante donne 2 bits par point d'echantillonnage.
    Retourne un vecteur binaire de IRISCODE_BITS bits sous forme de bytes.
    """
    # Centrer l'image autour de 0 (crucial pour que le signe ait du sens)
    iris_float = normalized_iris.astype(np.float64) - np.mean(normalized_iris)

    num_filters = 8
    # 2 bits par filtre par point (reel + imaginaire)
    points_per_filter = IRISCODE_BITS // (num_filters * 2)
    iriscode = []

    for k in range(num_filters):
        theta = k * np.pi / num_filters

        # Partie reelle (psi=0)
        kernel_real = cv2.getGaborKernel(
            ksize=(17, 17),
            sigma=2.0,
            theta=theta,
            lambd=6.0,
            gamma=0.5,
            psi=0,
        )
        # Partie imaginaire (psi=pi/2)
        kernel_imag = cv2.getGaborKernel(
            ksize=(17, 17),
            sigma=2.0,
            theta=theta,
            lambd=6.0,
            gamma=0.5,
            psi=np.pi / 2,
        )

        filtered_real = cv2.filter2D(iris_float, cv2.CV_64F, kernel_real)
        filtered_imag = cv2.filter2D(iris_float, cv2.CV_64F, kernel_imag)

        # Echantillonnage regulier
        flat_real = filtered_real.flatten()
        flat_imag = filtered_imag.flatten()
        indices = np.linspace(0, len(flat_real) - 1, points_per_filter, dtype=int)

        # 1 bit = signe de la partie reelle, 1 bit = signe de la partie imaginaire
        bits_real = (flat_real[indices] >= 0).astype(np.uint8)
        bits_imag = (flat_imag[indices] >= 0).astype(np.uint8)

        iriscode.extend(bits_real)
        iriscode.extend(bits_imag)

    iriscode = np.array(iriscode[:IRISCODE_BITS], dtype=np.uint8)
    return np.packbits(iriscode)


def hamming_distance(code1: bytes, code2: bytes, max_rotation: int = 15) -> float:
    """Calcule la distance de Hamming normalisee entre deux IrisCodes.

    Compense la rotation de l'oeil en testant des decalages circulaires
    de -max_rotation a +max_rotation bits, et retourne la distance minimale.
    C'est la methode standard de Daugman.

    Retourne un float entre 0.0 (identique) et 1.0 (completement different).
    """
    a = np.unpackbits(np.frombuffer(code1, dtype=np.uint8))
    b = np.unpackbits(np.frombuffer(code2, dtype=np.uint8))

    min_len = min(len(a), len(b))
    a, b = a[:min_len], b[:min_len]

    best_dist = float('inf')
    for shift in range(-max_rotation, max_rotation + 1):
        b_shifted = np.roll(b, shift)
        dist = np.sum(a != b_shifted) / min_len
        if dist < best_dist:
            best_dist = dist

    return best_dist
