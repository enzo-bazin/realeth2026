"""Script de test live pour IrisWallet.

Deux modes :
    - "local"  : flux webcam en continu (commandes clavier ESPACE/D/Q)
    - "remote" : capture en rafale sur le Raspberry Pi via SSH (interactif terminal)

Le mode est choisi automatiquement via config.CAPTURE_MODE ou l'argument --remote / --local.
"""

import sys
import os
import time
import json
import subprocess

# Ajouter le dossier hardware au path pour les imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cv2
import numpy as np

import config
from config import MATCH_THRESHOLD
from iris.capture import (
    _eye_cascade, compute_quality_score, list_cameras,
    _capture_remote_frames, detect_best_eye,
)
from iris.processing import detect_pupil_iris, normalize_iris, encode_iriscode, hamming_distance
from iris.antispoofing import (
    check_specular_reflection,
    check_texture_liveness,
    check_pupil_movement,
)
from utils.crypto import generate_key, encrypt_template, decrypt_template


# --- Couleurs BGR ---
GREEN = (0, 255, 0)
RED = (0, 0, 255)
YELLOW = (0, 255, 255)
WHITE = (255, 255, 255)
GRAY = (180, 180, 180)
DARK_BG = (30, 30, 30)


def draw_text(frame, text, pos, color=WHITE, scale=0.5, thickness=1):
    """Dessine du texte avec un fond sombre pour la lisibilite."""
    font = cv2.FONT_HERSHEY_SIMPLEX
    (w, h), _ = cv2.getTextSize(text, font, scale, thickness)
    x, y = pos
    cv2.rectangle(frame, (x - 2, y - h - 4), (x + w + 2, y + 4), DARK_BG, -1)
    cv2.putText(frame, text, (x, y), font, scale, color, thickness, cv2.LINE_AA)


def draw_panel(frame, lines, start_y=10):
    """Dessine un panneau d'infos en haut a gauche."""
    for i, (text, color) in enumerate(lines):
        draw_text(frame, text, (10, start_y + i * 22), color)


def status_color(passed):
    return GREEN if passed else RED


def run_scan(eye_crop, eye_frames):
    """Execute le pipeline complet sur une image d'oeil et retourne le rapport."""
    report = {
        "timestamp": time.strftime("%H:%M:%S"),
        "quality": {},
        "liveness": {},
        "segmentation": None,
        "iriscode": None,
        "encryption": None,
    }

    # 1. Qualite
    quality = compute_quality_score(eye_crop)
    report["quality"] = quality

    # 2. Liveness
    specular = check_specular_reflection(eye_crop)
    texture = check_texture_liveness(eye_crop)
    movement = check_pupil_movement(eye_frames) if len(eye_frames) >= 2 else {"passed": True, "skipped": True}
    alive = specular["passed"] and texture["passed"] and movement["passed"]
    report["liveness"] = {
        "alive": alive,
        "specular": specular,
        "texture": texture,
        "movement": movement,
    }

    # 3. Segmentation
    circles = detect_pupil_iris(eye_crop)
    if circles is None:
        report["segmentation"] = {"success": False, "error": "Iris not detected"}
        return report

    pupil, iris = circles
    report["segmentation"] = {
        "success": True,
        "pupil": {"x": int(pupil[0]), "y": int(pupil[1]), "r": int(pupil[2])},
        "iris": {"x": int(iris[0]), "y": int(iris[1]), "r": int(iris[2])},
    }

    # 4. IrisCode
    normalized = normalize_iris(eye_crop, pupil, iris)
    iriscode = encode_iriscode(normalized)
    raw_bytes = iriscode.tobytes()
    report["iriscode"] = {
        "size_bits": len(iriscode) * 8,
        "size_bytes": len(iriscode),
        "hex_full": raw_bytes.hex(),
        "binary_full": ''.join(format(b, '08b') for b in raw_bytes),
    }

    # 5. Chiffrement
    key = generate_key()
    encrypted = encrypt_template(raw_bytes, key)
    decrypted = decrypt_template(encrypted, key)
    report["encryption"] = {
        "success": decrypted == raw_bytes,
        "ciphertext_full": encrypted["ciphertext"],
        "nonce": encrypted["nonce"],
    }

    # 6. Verdict global
    report["workflow_ready"] = (
        quality["acceptable"]
        and alive
        and report["segmentation"]["success"]
        and report["encryption"]["success"]
    )

    return report


def print_report(report):
    """Affiche le rapport de scan dans le terminal."""
    print("\n" + "=" * 60)
    print(f"  SCAN REPORT — {report['timestamp']}")
    print("=" * 60)

    # Qualite
    q = report["quality"]
    qmark = "OK" if q.get("acceptable") else "FAIL"
    print(f"\n  [QUALITY] {qmark}")
    print(f"    Brightness : {q.get('brightness', '?'):>7}  (40-220)")
    print(f"    Contrast   : {q.get('contrast', '?'):>7}  (>30)")
    print(f"    Sharpness  : {q.get('sharpness', '?'):>7}  (>50)")

    # Liveness
    l = report["liveness"]
    lmark = "ALIVE" if l.get("alive") else "SPOOF"
    print(f"\n  [LIVENESS] {lmark}")
    sp = l.get("specular", {})
    print(f"    Specular   : {'PASS' if sp.get('passed') else 'FAIL'}  (spots: {sp.get('specular_spots', '?')})")
    tx = l.get("texture", {})
    print(f"    Texture    : {'PASS' if tx.get('passed') else 'FAIL'}  (LBP variance: {tx.get('lbp_variance', '?')})")
    mv = l.get("movement", {})
    if mv.get("skipped"):
        print(f"    Movement   : SKIP  (not enough frames)")
    else:
        print(f"    Movement   : {'PASS' if mv.get('passed') else 'FAIL'}  (avg: {mv.get('avg_movement', '?')} px)")

    # Segmentation
    s = report["segmentation"]
    if s is None:
        print(f"\n  [SEGMENTATION] NOT RUN")
    elif not s["success"]:
        print(f"\n  [SEGMENTATION] FAIL — {s['error']}")
    else:
        print(f"\n  [SEGMENTATION] OK")
        print(f"    Pupil : center=({s['pupil']['x']}, {s['pupil']['y']}) r={s['pupil']['r']}")
        print(f"    Iris  : center=({s['iris']['x']}, {s['iris']['y']}) r={s['iris']['r']}")

    # IrisCode
    ic = report.get("iriscode")
    if ic:
        print(f"\n  [IRISCODE] {ic['size_bits']} bits ({ic['size_bytes']} bytes)")
        print(f"\n    HEX ({ic['size_bytes']} bytes) :")
        hex_str = ic['hex_full']
        for i in range(0, len(hex_str), 64):
            print(f"      {hex_str[i:i+64]}")
        print(f"\n    BINARY ({ic['size_bits']} bits) :")
        bin_str = ic['binary_full']
        for i in range(0, len(bin_str), 64):
            print(f"      {bin_str[i:i+64]}")

    # Chiffrement
    enc = report.get("encryption")
    if enc:
        print(f"\n  [ENCRYPTION] {'OK — decrypt matches' if enc['success'] else 'FAIL'}")
        print(f"    Nonce      : {enc['nonce']}")
        print(f"    Ciphertext :")
        ct = enc['ciphertext_full']
        for i in range(0, len(ct), 76):
            print(f"      {ct[i:i+76]}")

    # --- VERDICT FINAL ---
    ready = report.get("workflow_ready", False)
    print()
    if ready:
        print("  " + "*" * 56)
        print("  *                                                    *")
        print("  *   WORKFLOW READY — SCAN PARFAIT                    *")
        print("  *   Ce template peut etre envoye au backend          *")
        print("  *   et au CRE Chainlink pour le matching.            *")
        print("  *                                                    *")
        print("  " + "*" * 56)
    else:
        print("  " + "-" * 56)
        print("  |  WORKFLOW NOT READY — problemes detectes :         |")
        q = report["quality"]
        l = report["liveness"]
        s = report["segmentation"]
        enc = report.get("encryption")
        if not q.get("acceptable"):
            print("  |    x Qualite image insuffisante                    |")
        if not l.get("alive"):
            print("  |    x Liveness check echoue (anti-spoofing)         |")
        if s is None or not s.get("success"):
            print("  |    x Segmentation iris echouee                     |")
        if enc and not enc.get("success"):
            print("  |    x Chiffrement/dechiffrement echoue              |")
        print("  " + "-" * 56)

    print("\n" + "=" * 60 + "\n")


def main():
    print("=" * 60)
    print("  IRISWALLET — Test Live")
    print("=" * 60)
    print()

    # --- Selection de la camera ---
    print("  Scan des cameras disponibles...")
    cameras = list_cameras()
    if not cameras:
        print("[ERREUR] Aucune camera detectee.")
        return

    print()
    for cam in cameras:
        marker = " <-- active" if cam["active"] else ""
        print(f"    [{cam['index']}] {cam['resolution']}  {cam['fps']}fps  ({cam['backend']}){marker}")
    print()

    if len(cameras) > 1:
        choice = input(f"  Choisir la camera (index) [{config.CAMERA_INDEX}] : ").strip()
        if choice.isdigit():
            idx = int(choice)
            valid = any(c["index"] == idx for c in cameras)
            if valid:
                config.CAMERA_INDEX = idx
                print(f"  -> Camera {idx} selectionnee")
            else:
                print(f"  -> Index {idx} invalide, on garde {config.CAMERA_INDEX}")
        else:
            print(f"  -> On garde la camera {config.CAMERA_INDEX}")
    else:
        config.CAMERA_INDEX = cameras[0]["index"]
        print(f"  Camera {config.CAMERA_INDEX} selectionnee (seule disponible)")

    print()
    print("  Commandes :")
    print("    ESPACE  = scan + freeze")
    print("    R       = reprendre le live")
    print("    D       = toggle debug (cercles pupille/iris)")
    print("    C       = changer de camera")
    print("    Q / ESC = quitter")
    print()
    print("  Astuce : rapprochez votre oeil de la camera,")
    print("  gardez un bon eclairage, restez stable.")
    print()

    cap = cv2.VideoCapture(config.CAMERA_INDEX)
    if not cap.isOpened():
        print(f"[ERREUR] Camera {config.CAMERA_INDEX} non disponible.")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, config.CAPTURE_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config.CAPTURE_HEIGHT)

    # Fenetre redimensionnable et agrandie
    cv2.namedWindow("IrisWallet — Test Live", cv2.WINDOW_NORMAL)
    cv2.resizeWindow("IrisWallet — Test Live", 1280, 720)

    debug_mode = False
    recent_eye_frames = []
    scan_count = 0
    last_templates = []  # pour comparer entre scans

    frozen = False          # True = image gelee apres ESPACE
    frozen_display = None    # frame gelee a afficher
    last_advice_time = 0     # anti-spam conseils terminal

    while True:
        # --- Lecture camera (sauf si freeze) ---
        if not frozen:
            ret, frame = cap.read()
            if not ret:
                break

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            display = frame.copy()

            # --- Detection des yeux en temps reel ---
            eyes = _eye_cascade.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40)
            )

            eye_detected = len(eyes) > 0
            eye_crop = None
            panel_lines = []
            advice = []  # conseils temps reel

            if eye_detected:
                largest = max(eyes, key=lambda e: e[2] * e[3])
                x, y, w, h = largest

                # Marge 20%
                mx, my = int(w * 0.2), int(h * 0.2)
                x1, y1 = max(0, x - mx), max(0, y - my)
                x2, y2 = min(gray.shape[1], x + w + mx), min(gray.shape[0], y + h + my)

                eye_crop = gray[y1:y2, x1:x2]

                # Rectangle autour de l'oeil
                cv2.rectangle(display, (x1, y1), (x2, y2), GREEN, 2)
                draw_text(display, "EYE DETECTED", (x1, y1 - 10), GREEN)

                # Garder les frames pour le mouvement
                recent_eye_frames.append(eye_crop.copy())
                if len(recent_eye_frames) > 10:
                    recent_eye_frames.pop(0)

                # Qualite en temps reel
                quality = compute_quality_score(eye_crop)
                panel_lines.append(("--- QUALITY ---", GRAY))
                panel_lines.append(
                    (f"Brightness: {quality['brightness']}", status_color(40 <= quality['brightness'] <= 220))
                )
                panel_lines.append(
                    (f"Contrast:   {quality['contrast']}", status_color(quality['contrast'] >= 30))
                )
                panel_lines.append(
                    (f"Sharpness:  {quality['sharpness']}", status_color(quality['sharpness'] >= 50))
                )
                panel_lines.append(
                    (f"Acceptable: {'YES' if quality['acceptable'] else 'NO'}", status_color(quality['acceptable']))
                )

                # --- Conseils qualite ---
                if quality['brightness'] < 40:
                    advice.append(("! Trop sombre — ajoutez de la lumiere", RED))
                elif quality['brightness'] > 220:
                    advice.append(("! Trop lumineux — reduisez la lumiere", RED))
                if quality['contrast'] < 30:
                    advice.append(("! Contraste faible — eclairez un cote du visage", YELLOW))
                if quality['sharpness'] < 50:
                    advice.append(("! Image floue — restez immobile, rapprochez-vous", YELLOW))

                # Liveness en temps reel
                specular = check_specular_reflection(eye_crop)
                texture = check_texture_liveness(eye_crop)
                panel_lines.append(("--- LIVENESS ---", GRAY))
                panel_lines.append(
                    (f"Specular: {'PASS' if specular['passed'] else 'FAIL'} ({specular['specular_spots']} spots)",
                     status_color(specular['passed']))
                )
                panel_lines.append(
                    (f"Texture:  {'PASS' if texture['passed'] else 'FAIL'} (var={texture['lbp_variance']})",
                     status_color(texture['passed']))
                )

                # --- Conseils liveness ---
                if not specular['passed']:
                    advice.append(("! Pas de reflet corneen — orientez une lumiere vers l'oeil", YELLOW))
                if not texture['passed']:
                    advice.append(("! Texture trop lisse — rapprochez l'oeil de la camera", YELLOW))

                # Taille de l'oeil detecte
                eye_size = w * h
                if eye_size < 3000:
                    advice.append(("! Oeil trop petit — rapprochez-vous de la camera", YELLOW))
                elif eye_size > 40000:
                    advice.append(("! Oeil trop gros — reculez un peu", YELLOW))

                # Debug : dessiner cercles pupille/iris
                if debug_mode and eye_crop is not None:
                    circles = detect_pupil_iris(eye_crop)
                    if circles is not None:
                        pupil, iris = circles
                        cv2.circle(display, (x1 + pupil[0], y1 + pupil[1]), pupil[2], YELLOW, 2)
                        cv2.circle(display, (x1 + iris[0], y1 + iris[1]), iris[2], GREEN, 2)
                        cv2.circle(display, (x1 + pupil[0], y1 + pupil[1]), 2, RED, -1)
                        panel_lines.append(("--- SEGMENTATION ---", GRAY))
                        panel_lines.append((f"Pupil: r={pupil[2]}", GREEN))
                        panel_lines.append((f"Iris:  r={iris[2]}", GREEN))
                    else:
                        panel_lines.append(("--- SEGMENTATION ---", GRAY))
                        panel_lines.append(("Circles: NOT FOUND", RED))
                        advice.append(("! Iris non segmente — centrez bien votre oeil", RED))

                # Ready ?
                if quality['acceptable'] and not advice:
                    panel_lines.append(("", WHITE))
                    panel_lines.append((">> READY — appuyez ESPACE <<", GREEN))
                elif quality['acceptable']:
                    panel_lines.append(("", WHITE))
                    panel_lines.append((">> PRET (avec warnings) <<", YELLOW))

            else:
                draw_text(display, "NO EYE — move closer", (10, gray.shape[0] - 50), RED, 0.7)
                advice.append(("Aucun oeil detecte — rapprochez votre oeil de la camera", RED))

            # --- Afficher conseils sur l'image (cote droit) ---
            if advice:
                advice_x = display.shape[1] - 420
                for i, (text, color) in enumerate(advice):
                    draw_text(display, text, (advice_x, 20 + i * 22), color, 0.45)

            # --- Print conseils dans le terminal (throttle 2s) ---
            now = time.time()
            if advice and now - last_advice_time > 2.0:
                last_advice_time = now
                for text, _ in advice:
                    print(f"  [CONSEIL] {text}")

            # --- Barre du bas ---
            bar_y = display.shape[0] - 35
            cv2.rectangle(display, (0, bar_y), (display.shape[1], display.shape[0]), DARK_BG, -1)
            controls = "SPACE=Scan+Freeze | R=Resume | D=Debug | Q=Quit"
            if debug_mode:
                controls += " | [DEBUG ON]"
            if frozen:
                controls += " | [FROZEN]"
            draw_text(display, controls, (10, display.shape[0] - 12), GRAY, 0.45)
            draw_text(display, f"Scans: {scan_count}", (display.shape[1] - 100, display.shape[0] - 12), YELLOW, 0.45)

            # Panel d'infos
            if panel_lines:
                draw_panel(display, panel_lines, start_y=20)

        # --- Affichage (frame live ou frozen) ---
        show = frozen_display if frozen else display
        cv2.imshow("IrisWallet — Test Live", show)

        # --- Input clavier ---
        key = cv2.waitKey(1) & 0xFF

        if key in (ord('q'), 27):  # Q ou ESC
            break

        elif key == ord('r') and frozen:
            frozen = False
            frozen_display = None
            print("[RESUME] Camera live")

        elif key == ord('d'):
            debug_mode = not debug_mode
            print(f"[DEBUG] {'ON' if debug_mode else 'OFF'}")

        elif key == ord('c'):
            # Changer de camera en live
            cap.release()
            cams = list_cameras()
            print("\n  Cameras disponibles :")
            for cam in cams:
                marker = " <-- active" if cam["index"] == config.CAMERA_INDEX else ""
                print(f"    [{cam['index']}] {cam['resolution']}  {cam['fps']}fps  ({cam['backend']}){marker}")
            choice = input(f"  Nouveau index [{config.CAMERA_INDEX}] : ").strip()
            if choice.isdigit():
                idx = int(choice)
                if any(c["index"] == idx for c in cams):
                    config.CAMERA_INDEX = idx
                    print(f"  -> Camera {idx} selectionnee")
                else:
                    print(f"  -> Index {idx} invalide")
            cap = cv2.VideoCapture(config.CAMERA_INDEX)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, config.CAPTURE_WIDTH)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config.CAPTURE_HEIGHT)
            print()

        elif key == ord(' ') and not frozen:
            if eye_crop is not None:
                scan_count += 1

                # --- Freeze l'image ---
                frozen = True
                scan_display = display.copy()

                # Bandeau FROZEN
                draw_text(scan_display, "FROZEN — scan en cours...", (display.shape[1] // 2 - 130, 20), YELLOW, 0.6)

                frozen_display = scan_display
                cv2.imshow("IrisWallet — Test Live", frozen_display)
                cv2.waitKey(1)

                print(f"\n>>> SCAN #{scan_count} en cours...")
                report = run_scan(eye_crop, recent_eye_frames[-5:])
                print_report(report)

                # --- Conseils post-scan dans le terminal ---
                print("  --- CONSEILS POST-SCAN ---")
                q = report["quality"]
                if not q.get("acceptable"):
                    if q.get("brightness", 999) < 40:
                        print("  -> Image trop sombre. Ajoutez une source de lumiere.")
                    if q.get("brightness", 0) > 220:
                        print("  -> Image trop claire. Reduisez l'eclairage direct.")
                    if q.get("contrast", 999) < 30:
                        print("  -> Contraste insuffisant. Eclairez un cote du visage.")
                    if q.get("sharpness", 999) < 50:
                        print("  -> Image floue. Restez immobile et rapprochez-vous.")

                l = report["liveness"]
                if not l.get("alive"):
                    if not l.get("specular", {}).get("passed"):
                        print("  -> Pas de reflet corneen. Avec une webcam c'est normal,")
                        print("     la camera IR + LEDs resoudra ce probleme.")
                    if not l.get("texture", {}).get("passed"):
                        print("  -> Texture trop uniforme. Rapprochez l'oeil pour plus de detail.")
                    mv = l.get("movement", {})
                    if not mv.get("skipped") and not mv.get("passed"):
                        if mv.get("avg_movement", 0) < 0.3:
                            print("  -> Aucun mouvement detecte. Bougez legerement les yeux.")
                        else:
                            print("  -> Trop de mouvement. Restez plus stable.")

                s = report["segmentation"]
                if s and not s.get("success"):
                    print("  -> Iris non segmente. Centrez votre oeil et ouvrez-le bien.")
                    print("     Essayez de rapprocher/eloigner legerement votre oeil.")

                if report.get("iriscode"):
                    print("  -> IrisCode genere avec succes !")
                else:
                    print("  -> Echec generation IrisCode. Ameliorez les points ci-dessus.")

                print("  -> Appuyez R pour reprendre la camera, ESPACE pour re-scanner")
                print()

                # Mettre a jour le frozen_display avec le resultat
                result_display = scan_display.copy()
                result_text = "SCAN OK" if report.get("iriscode") else "SCAN FAILED"
                result_color = GREEN if report.get("iriscode") else RED
                draw_text(result_display, f"FROZEN — {result_text} — R=Resume", (display.shape[1] // 2 - 180, 20), result_color, 0.6)
                frozen_display = result_display

                # Comparaison entre scans
                if report.get("iriscode"):
                    circles = detect_pupil_iris(eye_crop)
                    if circles:
                        pupil, iris = circles
                        norm = normalize_iris(eye_crop, pupil, iris)
                        code_new = encode_iriscode(norm)
                        if main._last_code is not None:
                            dist = hamming_distance(main._last_code.tobytes(), code_new.tobytes())
                            match = dist < MATCH_THRESHOLD
                            tag = "MATCH" if match else "NO MATCH"
                            print(f"  [MATCH] Distance: {dist:.4f} (seuil: {MATCH_THRESHOLD}) -> {tag}")
                        main._last_code = code_new

            else:
                print("\n[!] Aucun oeil detecte — rapprochez votre oeil de la camera")

        elif key == ord(' ') and frozen:
            # Re-scan depuis le freeze : reprendre la camera, scanner immediatement
            frozen = False
            frozen_display = None
            print("[RESUME] Reprise camera pour nouveau scan...")

    cap.release()
    cv2.destroyAllWindows()
    print("\nBye!")


main._last_code = None


# ==============================================================
#  MODE REMOTE — Raspberry Pi (pas de flux continu)
# ==============================================================

_remote_last_code = None


def main_remote():
    """Test interactif en mode remote (Raspberry Pi via SSH).

    Pas de preview live — on capture en rafale sur le Pi,
    on rapatrie les photos, puis on les analyse localement.
    """
    global _remote_last_code

    print("=" * 60)
    print("  IRISWALLET — Test Remote (Raspberry Pi)")
    print("=" * 60)
    print()
    print(f"  Pi : {config.PI_USER}@{config.PI_IP}")
    print(f"  Burst : {config.PI_BURST_COUNT} photos")
    print(f"  Script : {config.PI_CAPTURE_SCRIPT}")
    print()
    print("  Commandes :")
    print("    ENTER   = lancer une capture + scan")
    print("    d ENTER = toggle debug (afficher les images)")
    print("    n ENTER = changer le nombre de photos")
    print("    q ENTER = quitter")
    print()

    debug_mode = False
    scan_count = 0

    while True:
        try:
            cmd = input("  > ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            break

        if cmd == "q":
            break
        elif cmd == "d":
            debug_mode = not debug_mode
            print(f"  [DEBUG] {'ON — les images seront affichees' if debug_mode else 'OFF'}")
            continue
        elif cmd == "n":
            new_count = input(f"  Nombre de photos [{config.PI_BURST_COUNT}] : ").strip()
            if new_count.isdigit() and int(new_count) > 0:
                config.PI_BURST_COUNT = int(new_count)
                print(f"  -> {config.PI_BURST_COUNT} photos par rafale")
            continue
        elif cmd != "":
            print("  Commande inconnue. ENTER=scan, d=debug, n=count, q=quit")
            continue

        # --- Capture en rafale depuis le Pi ---
        scan_count += 1
        print(f"\n>>> SCAN #{scan_count} — Capture de {config.PI_BURST_COUNT} photos sur le Pi...")
        start = time.time()
        raw_frames = _capture_remote_frames()
        elapsed = time.time() - start

        if not raw_frames:
            print(f"  [ERREUR] Aucune photo recue du Pi ({elapsed:.1f}s)")
            print("  Verifiez :")
            print(f"    - SSH : ssh {config.PI_USER}@{config.PI_IP}")
            print(f"    - Script : {config.PI_CAPTURE_SCRIPT} existe sur le Pi")
            print()
            continue

        print(f"  {len(raw_frames)} photos recues en {elapsed:.1f}s")

        # --- Afficher toutes les photos brutes du Pi ---
        print("  Affichage des photos... (appuyez sur une touche pour continuer)")
        for i, gray in enumerate(raw_frames):
            win_name = f"Photo {i+1}/{len(raw_frames)}"
            cv2.namedWindow(win_name, cv2.WINDOW_NORMAL)
            cv2.resizeWindow(win_name, 640, 480)
            # Placer les fenetres cote a cote
            cv2.moveWindow(win_name, 50 + (i % 5) * 660, 50 + (i // 5) * 520)
            cv2.imshow(win_name, gray)

        cv2.waitKey(0)
        cv2.destroyAllWindows()

        # --- Detection des yeux dans chaque frame ---
        eye_frames = []
        best_eye = None
        best_score = -1.0
        best_quality = {}
        best_frame_idx = -1

        for i, gray in enumerate(raw_frames):
            eye_crop = detect_best_eye(gray)
            if eye_crop is None:
                print(f"    frame {i+1}: pas d'oeil detecte")
                continue

            eye_frames.append(eye_crop)
            quality = compute_quality_score(eye_crop)
            status = "OK" if quality["acceptable"] else "low quality"
            print(f"    frame {i+1}: oeil detecte — brightness={quality['brightness']} "
                  f"contrast={quality['contrast']} sharpness={quality['sharpness']} [{status}]")

            if not quality["acceptable"]:
                continue

            score = quality["sharpness"] + quality["contrast"]
            if score > best_score:
                best_score = score
                best_eye = eye_crop
                best_quality = quality
                best_frame_idx = i

        if best_eye is None:
            print(f"\n  [ECHEC] Aucun oeil de qualite suffisante dans les {len(raw_frames)} photos")
            if not eye_frames:
                print("  -> Aucun oeil detecte du tout. Rapprochez l'oeil de la camera.")
            else:
                print("  -> Oeil detecte mais qualite insuffisante. Ameliorez l'eclairage.")
            # Afficher quand meme les eye crops detectes s'il y en a
            if eye_frames:
                print("  Affichage des yeux detectes (qualite insuffisante)...")
                for i, ef in enumerate(eye_frames):
                    win_name = f"Eye crop {i+1} (low quality)"
                    cv2.namedWindow(win_name, cv2.WINDOW_NORMAL)
                    cv2.resizeWindow(win_name, 300, 300)
                    cv2.imshow(win_name, ef)
                cv2.waitKey(0)
                cv2.destroyAllWindows()
            print()
            continue

        print(f"\n  Meilleure frame : #{best_frame_idx + 1}")

        # --- Affichage debug : eye crops + cercles ---
        if debug_mode:
            for i, ef in enumerate(eye_frames):
                win_name = f"Eye crop {i+1}"
                cv2.namedWindow(win_name, cv2.WINDOW_NORMAL)
                cv2.resizeWindow(win_name, 300, 300)
                cv2.imshow(win_name, ef)
            # Afficher la meilleure avec les cercles si possible
            best_display = cv2.cvtColor(best_eye, cv2.COLOR_GRAY2BGR)
            circles = detect_pupil_iris(best_eye)
            if circles is not None:
                pupil, iris = circles
                cv2.circle(best_display, (pupil[0], pupil[1]), pupil[2], YELLOW, 2)
                cv2.circle(best_display, (iris[0], iris[1]), iris[2], GREEN, 2)
                cv2.circle(best_display, (pupil[0], pupil[1]), 2, RED, -1)
            cv2.namedWindow("Best Eye (debug)", cv2.WINDOW_NORMAL)
            cv2.resizeWindow("Best Eye (debug)", 400, 400)
            cv2.imshow("Best Eye (debug)", best_display)
            print("  [DEBUG] Appuyez sur une touche pour continuer...")
            cv2.waitKey(0)
            cv2.destroyAllWindows()

        # --- Scan complet ---
        report = run_scan(best_eye, eye_frames[-5:])
        print_report(report)

        # --- Comparaison entre scans ---
        if report.get("iriscode"):
            circles = detect_pupil_iris(best_eye)
            if circles:
                pupil, iris = circles
                norm = normalize_iris(best_eye, pupil, iris)
                code_new = encode_iriscode(norm)
                if _remote_last_code is not None:
                    dist = hamming_distance(_remote_last_code.tobytes(), code_new.tobytes())
                    match = dist < MATCH_THRESHOLD
                    tag = "MATCH" if match else "NO MATCH"
                    print(f"  [MATCH vs scan precedent] Distance: {dist:.4f} (seuil: {MATCH_THRESHOLD}) -> {tag}")
                _remote_last_code = code_new

        print()

    print("\nBye!")


def main_image(image_paths):
    """Test depuis des images locales (pas besoin de camera ni de Pi).

    Usage: python test_live.py --image photo1.jpg photo2.jpg ...
    """
    print("=" * 60)
    print("  IRISWALLET — Test Image")
    print("=" * 60)
    print(f"\n  {len(image_paths)} image(s) a analyser\n")

    raw_color = []
    raw_frames = []
    for path in image_paths:
        img_color = cv2.imread(path)
        if img_color is None:
            print(f"  [ERREUR] Impossible de lire : {path}")
            continue
        raw_color.append(img_color)
        raw_frames.append(cv2.cvtColor(img_color, cv2.COLOR_BGR2GRAY))
        print(f"  Chargee : {path} ({img_color.shape[1]}x{img_color.shape[0]})")

    if not raw_frames:
        print("\n  Aucune image valide.")
        return

    # Pas de crop — on utilise l'image entiere directement
    # Afficher les images + segmentation
    best_eye = None
    best_eye_color = None
    best_score = -1.0
    best_frame_idx = -1
    eye_frames = []

    for i, gray in enumerate(raw_frames):
        quality = compute_quality_score(gray)
        status = "OK" if quality["acceptable"] else "low quality"
        print(f"    image {i+1}: brightness={quality['brightness']} "
              f"contrast={quality['contrast']} sharpness={quality['sharpness']} [{status}]")

        eye_frames.append(gray)

        score = quality["sharpness"] + quality["contrast"]
        if score > best_score:
            best_score = score
            best_eye = gray
            best_eye_color = raw_color[i]
            best_frame_idx = i

    print(f"\n  Meilleure image : #{best_frame_idx + 1}")

    # Afficher l'image en couleur avec cercles de segmentation
    best_display = best_eye_color.copy()
    circles = detect_pupil_iris(best_eye)
    if circles is not None:
        pupil, iris = circles
        cv2.circle(best_display, (pupil[0], pupil[1]), pupil[2], YELLOW, 2)
        cv2.circle(best_display, (iris[0], iris[1]), iris[2], GREEN, 2)
        cv2.circle(best_display, (pupil[0], pupil[1]), 2, RED, -1)
        print(f"    Pupil: center=({pupil[0]}, {pupil[1]}) r={pupil[2]}")
        print(f"    Iris:  center=({iris[0]}, {iris[1]}) r={iris[2]}")
    else:
        print("    Segmentation echouee — pupille/iris non detectes")
    cv2.namedWindow("Image + Segmentation", cv2.WINDOW_NORMAL)
    cv2.resizeWindow("Image + Segmentation", 900, 700)
    cv2.imshow("Image + Segmentation", best_display)
    cv2.waitKey(0)
    cv2.destroyAllWindows()

    # Scan complet
    report = run_scan(best_eye, eye_frames[-5:])
    print_report(report)

    # --- Comparaison entre images ---
    if report.get("iriscode") and len(eye_frames) >= 2:
        codes = []
        for ef in eye_frames:
            circles = detect_pupil_iris(ef)
            if circles:
                pupil, iris = circles
                norm = normalize_iris(ef, pupil, iris)
                codes.append(encode_iriscode(norm))
        if len(codes) >= 2:
            print("  --- COMPARAISON INTER-IMAGES ---")
            for i in range(len(codes)):
                for j in range(i + 1, len(codes)):
                    dist = hamming_distance(codes[i].tobytes(), codes[j].tobytes())
                    match = dist < MATCH_THRESHOLD
                    tag = "MATCH" if match else "NO MATCH"
                    print(f"  [MATCH] image {i+1} vs image {j+1} : distance={dist:.4f} (seuil: {MATCH_THRESHOLD}) -> {tag}")
            print()


# ==============================================================
#  MODE REMOTE LIVE — Flux continu depuis le Raspberry Pi
# ==============================================================

def _start_pi_stream():
    """Lance le stream MJPEG sur le Pi via SSH (en background)."""
    pi = f"{config.PI_USER}@{config.PI_IP}"
    port = getattr(config, "PI_STREAM_PORT", 8888)
    # Kill ancien stream s'il tourne
    subprocess.run(["ssh", pi, "pkill -f rpicam-vid"],
                   capture_output=True, timeout=5)
    time.sleep(0.5)
    # Lancer le stream en background sur le Pi
    ssh_cmd = (
        f"nohup rpicam-vid -t 0 --codec mjpeg --width 1280 --height 960 "
        f"--framerate 15 --inline -l -o tcp://0.0.0.0:{port} --nopreview "
        f"> /tmp/stream.log 2>&1 & disown"
    )
    subprocess.Popen(["ssh", pi, ssh_cmd],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)  # laisser le stream demarrer
    return port


def _stop_pi_stream():
    """Arrete le stream sur le Pi."""
    pi = f"{config.PI_USER}@{config.PI_IP}"
    subprocess.run(["ssh", pi, "pkill -f rpicam-vid"],
                   capture_output=True, timeout=5)


def main_remote_live():
    """Flux continu depuis le Raspberry Pi — indicateurs legers + scan manuel.

    La boucle live ne fait QUE la detection Haar (rapide).
    Les checks lourds (qualite, liveness, segmentation) ne tournent
    que toutes les ~0.5s pour mettre a jour les indicateurs.
    Le scan complet se lance uniquement sur ESPACE.
    """
    print("=" * 60)
    print("  IRISWALLET — Remote Live (Raspberry Pi Stream)")
    print("=" * 60)
    print()
    print(f"  Pi : {config.PI_USER}@{config.PI_IP}")
    print()

    # --- Lancer le stream sur le Pi ---
    print("  Demarrage du stream sur le Pi...")
    port = _start_pi_stream()
    stream_url = f"tcp://{config.PI_IP}:{port}"
    print(f"  Stream URL : {stream_url}")

    cap = cv2.VideoCapture(stream_url)
    if not cap.isOpened():
        print(f"[ERREUR] Impossible de se connecter au stream : {stream_url}")
        print("  Verifiez que le Pi est accessible et que le stream tourne.")
        _stop_pi_stream()
        return

    print("  Connecte ! Flux en direct.")
    print()
    print("  Commandes :")
    print("    ESPACE = lancer le scan")
    print("    P      = prendre une photo (image brute)")
    print("    R      = reprendre apres freeze")
    print("    D      = toggle debug")
    print("    Q/ESC  = quitter")
    print()

    cv2.namedWindow("IrisWallet — Remote Live", cv2.WINDOW_NORMAL)
    cv2.resizeWindow("IrisWallet — Remote Live", 1280, 720)

    scan_count = 0
    photo_count = 0
    _remote_live_last_code = None
    recent_eye_frames = []

    frozen = False
    frozen_display = None

    # Indicateurs mis a jour periodiquement (pas chaque frame)
    last_check_time = 0
    CHECK_INTERVAL = 0.5  # secondes entre chaque check lourd
    indicator_eye = False
    indicator_quality = False
    indicator_brightness = "-"
    indicator_contrast = "-"
    indicator_sharpness = "-"
    indicator_ready = False

    while True:
        # --- Si frozen, afficher le resultat ---
        if frozen:
            cv2.imshow("IrisWallet — Remote Live", frozen_display)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord('q'), 27):
                break
            elif key == ord('r'):
                frozen = False
                frozen_display = None
                print("[RESUME] Camera live")
            continue

        ret, frame = cap.read()
        if not ret:
            blank = np.zeros((720, 1280, 3), dtype=np.uint8)
            draw_text(blank, "Connexion perdue... reconnexion...", (400, 360), RED, 0.8)
            cv2.imshow("IrisWallet — Remote Live", blank)
            key = cv2.waitKey(500) & 0xFF
            if key in (ord('q'), 27):
                break
            cap.release()
            cap = cv2.VideoCapture(stream_url)
            continue

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        display = frame.copy()

        # --- Detection oeil (Haar = rapide, chaque frame) ---
        eyes = _eye_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40)
        )

        eye_crop = None
        if len(eyes) > 0:
            largest = max(eyes, key=lambda e: e[2] * e[3])
            x, y, w, h = largest
            mx, my = int(w * 0.2), int(h * 0.2)
            x1, y1 = max(0, x - mx), max(0, y - my)
            x2, y2 = min(gray.shape[1], x + w + mx), min(gray.shape[0], y + h + my)
            eye_crop = gray[y1:y2, x1:x2]

            cv2.rectangle(display, (x1, y1), (x2, y2), GREEN, 2)

            recent_eye_frames.append(eye_crop.copy())
            if len(recent_eye_frames) > 10:
                recent_eye_frames.pop(0)

        # --- Checks lourds seulement toutes les CHECK_INTERVAL secondes ---
        now = time.time()
        if now - last_check_time >= CHECK_INTERVAL:
            last_check_time = now
            if eye_crop is not None:
                indicator_eye = True
                q = compute_quality_score(eye_crop)
                indicator_quality = q["acceptable"]
                indicator_brightness = str(q["brightness"])
                indicator_contrast = str(q["contrast"])
                indicator_sharpness = str(q["sharpness"])
                indicator_ready = q["acceptable"]
            else:
                indicator_eye = False
                indicator_quality = False
                indicator_brightness = "-"
                indicator_contrast = "-"
                indicator_sharpness = "-"
                indicator_ready = False

        # --- Indicateurs legers sur l'image ---
        # Pastille oeil
        eye_color = GREEN if indicator_eye else RED
        cv2.circle(display, (30, 30), 12, eye_color, -1)
        draw_text(display, "EYE" if indicator_eye else "NO EYE", (50, 35), eye_color, 0.5)

        # Pastille qualite
        q_color = GREEN if indicator_quality else RED
        cv2.circle(display, (30, 60), 12, q_color, -1)
        draw_text(display, f"QUALITY {'OK' if indicator_quality else 'LOW'}", (50, 65), q_color, 0.5)

        # Details qualite (petits)
        draw_text(display, f"B:{indicator_brightness} C:{indicator_contrast} S:{indicator_sharpness}",
                  (50, 88), GRAY, 0.4)

        # Gros indicateur central
        if indicator_ready:
            draw_text(display, ">> PRET — appuyez ESPACE <<",
                      (display.shape[1] // 2 - 160, 35), GREEN, 0.7)
        elif indicator_eye:
            draw_text(display, "Qualite insuffisante",
                      (display.shape[1] // 2 - 100, 35), YELLOW, 0.6)
        else:
            draw_text(display, "Rapprochez votre oeil",
                      (display.shape[1] // 2 - 110, 35), RED, 0.6)

        # --- Barre du bas ---
        bar_y = display.shape[0] - 35
        cv2.rectangle(display, (0, bar_y), (display.shape[1], display.shape[0]), DARK_BG, -1)
        controls = "SPACE=Scan | P=Photo | R=Resume | D=Debug | Q=Quit"
        draw_text(display, controls, (10, display.shape[0] - 12), GRAY, 0.45)
        draw_text(display, f"Scans: {scan_count}", (display.shape[1] - 100, display.shape[0] - 12), YELLOW, 0.45)

        cv2.imshow("IrisWallet — Remote Live", display)
        key = cv2.waitKey(1) & 0xFF

        if key in (ord('q'), 27):
            break

        elif key == ord('p'):
            # Photo brute (sans overlay)
            photo_count += 1
            filename = f"photo_{time.strftime('%H%M%S')}_{photo_count}.jpg"
            cv2.imwrite(filename, frame)
            print(f"[PHOTO] Sauvegardee : {filename}")

        elif key == ord('d'):
            # Bascule : reduire l'intervalle de check pour plus de detail
            if CHECK_INTERVAL > 0.2:
                CHECK_INTERVAL = 0.1
                print("[DEBUG] Checks rapides (0.1s) — peut ralentir")
            else:
                CHECK_INTERVAL = 0.5
                print("[DEBUG] Checks normaux (0.5s)")

        elif key == ord(' ') and eye_crop is not None:
            # --- SCAN MANUEL ---
            scan_count += 1
            frozen = True
            scan_display = display.copy()
            draw_text(scan_display, "SCAN EN COURS...",
                      (display.shape[1] // 2 - 100, display.shape[0] // 2), YELLOW, 0.8)
            frozen_display = scan_display
            cv2.imshow("IrisWallet — Remote Live", frozen_display)
            cv2.waitKey(1)

            print(f"\n>>> SCAN #{scan_count} en cours...")
            report = run_scan(eye_crop, recent_eye_frames[-5:])
            print_report(report)

            # --- Affichage du resultat ---
            result_display = display.copy()

            if report.get("workflow_ready"):
                overlay = result_display.copy()
                cv2.rectangle(overlay, (0, 0),
                              (result_display.shape[1], result_display.shape[0]),
                              (0, 80, 0), -1)
                cv2.addWeighted(overlay, 0.3, result_display, 0.7, 0, result_display)

                font = cv2.FONT_HERSHEY_SIMPLEX
                cx = result_display.shape[1] // 2
                cy = result_display.shape[0] // 2

                for text, dy, scale in [("SCAN REUSSI", -40, 1.2),
                                        ("Template envoye au workflow !", 20, 0.7),
                                        ("Vous pouvez retirer votre oeil.", 60, 0.6),
                                        ("Appuyez R pour reprendre", 100, 0.5)]:
                    (tw, _), _ = cv2.getTextSize(text, font, scale, 2)
                    cv2.putText(result_display, text, (cx - tw // 2, cy + dy),
                                font, scale, GREEN, 2, cv2.LINE_AA)

                # Checkmark
                cv2.circle(result_display, (cx, cy - 120), 50, GREEN, 4)
                cv2.line(result_display, (cx - 25, cy - 120), (cx - 5, cy - 100), GREEN, 4)
                cv2.line(result_display, (cx - 5, cy - 100), (cx + 30, cy - 145), GREEN, 4)

                print("  >>> TEMPLATE ENVOYE AU WORKFLOW <<<")

                # Comparaison
                if report.get("iriscode"):
                    circles = detect_pupil_iris(eye_crop)
                    if circles:
                        pupil, iris = circles
                        norm = normalize_iris(eye_crop, pupil, iris)
                        code_new = encode_iriscode(norm)
                        if _remote_live_last_code is not None:
                            dist = hamming_distance(_remote_live_last_code.tobytes(), code_new.tobytes())
                            tag = "MATCH" if dist < MATCH_THRESHOLD else "NO MATCH"
                            print(f"  [MATCH vs precedent] Distance: {dist:.4f} -> {tag}")
                        _remote_live_last_code = code_new
            else:
                overlay = result_display.copy()
                cv2.rectangle(overlay, (0, 0),
                              (result_display.shape[1], result_display.shape[0]),
                              (0, 0, 80), -1)
                cv2.addWeighted(overlay, 0.3, result_display, 0.7, 0, result_display)

                font = cv2.FONT_HERSHEY_SIMPLEX
                cx = result_display.shape[1] // 2
                cy = result_display.shape[0] // 2
                for text, dy, scale in [("SCAN ECHOUE", -20, 1.0),
                                        ("Appuyez R pour reessayer", 30, 0.6)]:
                    (tw, _), _ = cv2.getTextSize(text, font, scale, 2)
                    cv2.putText(result_display, text, (cx - tw // 2, cy + dy),
                                font, scale, RED, 2, cv2.LINE_AA)

            frozen_display = result_display

        elif key == ord(' ') and eye_crop is None:
            print("[!] Aucun oeil detecte — rapprochez votre oeil")

    cap.release()
    cv2.destroyAllWindows()
    _stop_pi_stream()
    print("\nStream arrete. Bye!")


if __name__ == "__main__":
    # --image path1 path2 ...
    if "--image" in sys.argv:
        idx = sys.argv.index("--image")
        paths = sys.argv[idx + 1:]
        if not paths:
            print("Usage: python test_live.py --image photo1.jpg [photo2.jpg ...]")
            sys.exit(1)
        main_image(paths)
    elif "--remotelive" in sys.argv:
        main_remote_live()
    else:
        # Choix du mode via argument ou config
        mode = config.CAPTURE_MODE
        if "--remote" in sys.argv:
            mode = "remote"
        elif "--local" in sys.argv:
            mode = "local"

        if mode == "remote":
            main_remote()
        else:
            main()
