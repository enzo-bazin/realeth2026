"""IrisGate Backend — API for iris enrollment and identification.

Extension endpoints:
    POST /api/scan      — Capture photo via Pi + identify iris
    POST /api/register  — Register an iris with a wallet name
    GET  /api/accounts  — List accounts

Direct endpoints (image upload):
    POST /enroll    — Enroll an iris (upload image)
    POST /identify  — Identify an iris (upload image)

Iris templates are stored in SQLite for Hamming distance matching.
"""

import os
import sys
import json
import time
import uuid
import tempfile
import sqlite3
import hashlib
import subprocess
from pathlib import Path

from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import cv2
import threading

# Add iris-recognition to path
IRIS_RECOGNITION_DIR = os.path.join(os.path.dirname(__file__), "..", "iris-recognition")
sys.path.insert(0, IRIS_RECOGNITION_DIR)

from iris_recognition import process_image, compare, get_pipeline, get_matcher, template_to_hash
import numpy as np

app = Flask(__name__)
CORS(app)

DB_PATH = os.path.join(os.path.dirname(__file__), "irisgate.db")
MATCH_THRESHOLD = 0.35

# --- Pi Config ---
PI_USER = os.environ.get("PI_USER", "epitech")
PI_IP = os.environ.get("PI_IP", "10.105.174.149")
PI_STREAM_PORT = int(os.environ.get("PI_STREAM_PORT", "8888"))

# Stream state
_stream_cap = None
_cap_lock = threading.Lock()
_scanning = False  # True during a scan, stream pauses


# --- Pi Camera ---

def _ensure_pi_stream():
    """Start the Pi stream if not already active, return the VideoCapture."""
    global _stream_cap
    if _stream_cap is not None and _stream_cap.isOpened():
        return _stream_cap

    pi = f"{PI_USER}@{PI_IP}"

    # Kill previous stream
    subprocess.run(["ssh", pi, "pkill -f rpicam-vid"],
                   capture_output=True, timeout=5)
    time.sleep(0.5)

    # Start the stream
    ssh_cmd = (
        f"nohup rpicam-vid -t 0 --codec mjpeg --width 640 --height 480 "
        f"--framerate 15 --inline -l -o tcp://0.0.0.0:{PI_STREAM_PORT} --nopreview "
        f"> /tmp/stream.log 2>&1 & disown"
    )
    subprocess.Popen(["ssh", pi, ssh_cmd],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(3)

    stream_url = f"tcp://{PI_IP}:{PI_STREAM_PORT}"
    _stream_cap = cv2.VideoCapture(stream_url)

    if not _stream_cap.isOpened():
        _stream_cap = None
        raise RuntimeError(f"Cannot connect to Pi stream: {stream_url}")

    # Flush buffer (get the most recent frame)
    for _ in range(5):
        _stream_cap.read()

    return _stream_cap


def _capture_frame():
    """Capture a frame from the Pi and save it as a temp file."""
    global _scanning, _stream_cap

    _scanning = True
    time.sleep(0.1)  # let the stream pause

    try:
        with _cap_lock:
            cap = _ensure_pi_stream()

            # Flush buffer to get the most recent frame
            for _ in range(5):
                cap.read()

            ret, frame = cap.read()
            if not ret:
                _stream_cap = None
                cap = _ensure_pi_stream()
                for _ in range(3):
                    cap.read()
                ret, frame = cap.read()
                if not ret:
                    raise RuntimeError("Failed to capture frame from Pi")

        tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
        cv2.imwrite(tmp.name, frame)
        tmp.close()
        return tmp.name
    finally:
        _scanning = False


def _process_captured_frame():
    """Capture a frame from the Pi and run it through the iris pipeline."""
    image_path = _capture_frame()
    try:
        template, iris_hash = process_image(image_path)
        return template, iris_hash
    finally:
        os.unlink(image_path)


# --- Database ---

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            address TEXT PRIMARY KEY,
            wallet_name TEXT NOT NULL DEFAULT '',
            iris_codes BLOB NOT NULL,
            mask_codes BLOB NOT NULL,
            iris_code_version TEXT,
            eye_side TEXT DEFAULT 'left',
            private_key TEXT DEFAULT '',
            iris_address TEXT DEFAULT '',
            ledger_address TEXT DEFAULT '',
            balance REAL NOT NULL DEFAULT 0.0,
            created_at REAL NOT NULL
        )
    """)
    # Add columns if missing (existing DBs)
    for col, default in [("private_key", "''"), ("iris_address", "''"), ("ledger_address", "''")]:
        try:
            conn.execute(f"ALTER TABLE accounts ADD COLUMN {col} TEXT DEFAULT {default}")
        except sqlite3.OperationalError:
            pass
    conn.commit()
    conn.close()


def save_account(address, wallet_name, template, eye_side="left", private_key="", iris_address="", ledger_address=""):
    iris_codes_bytes = _serialize_codes(template.iris_codes)
    mask_codes_bytes = _serialize_codes(template.mask_codes)
    version = getattr(template, 'iris_code_version', None)

    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT INTO accounts (address, wallet_name, iris_codes, mask_codes, iris_code_version, eye_side, private_key, iris_address, ledger_address, balance, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (address, wallet_name, iris_codes_bytes, mask_codes_bytes, version, eye_side, private_key, iris_address, ledger_address, 0.0, time.time())
    )
    conn.commit()
    conn.close()


def get_account_info(address):
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT address, wallet_name, balance, created_at, private_key, iris_address, ledger_address FROM accounts WHERE address = ?",
        (address,)
    ).fetchone()
    conn.close()
    if row is None:
        return None
    info = {
        "walletAddress": row[0],
        "walletName": row[1],
        "balance": row[2],
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(row[3])),
    }
    if row[4]:
        info["privateKey"] = row[4]
    if row[5]:
        info["irisAddress"] = row[5]
    if row[6]:
        info["ledgerAddress"] = row[6]
    return info


def load_all_accounts():
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT address, iris_codes, mask_codes, iris_code_version, eye_side, created_at FROM accounts"
    ).fetchall()
    conn.close()

    accounts = []
    for address, iris_codes_bytes, mask_codes_bytes, version, eye_side, created_at in rows:
        template = _deserialize_template(iris_codes_bytes, mask_codes_bytes, version)
        accounts.append({
            "address": address,
            "template": template,
            "eye_side": eye_side,
            "created_at": created_at,
        })
    return accounts


def delete_account(address):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.execute("DELETE FROM accounts WHERE address = ?", (address,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def _serialize_codes(codes):
    parts = []
    for arr in codes:
        parts.append({
            "shape": list(arr.shape),
            "dtype": str(arr.dtype),
            "data": arr.tobytes().hex(),
        })
    return json.dumps(parts).encode()


def _deserialize_codes(raw_bytes):
    parts = json.loads(raw_bytes.decode())
    codes = []
    for p in parts:
        arr = np.frombuffer(bytes.fromhex(p["data"]), dtype=np.dtype(p["dtype"]))
        arr = arr.reshape(p["shape"])
        codes.append(arr)
    return codes


def _deserialize_template(iris_codes_bytes, mask_codes_bytes, version):
    import iris as iris_module
    iris_codes = _deserialize_codes(iris_codes_bytes)
    mask_codes = _deserialize_codes(mask_codes_bytes)
    return iris_module.IrisTemplate(
        iris_codes=iris_codes,
        mask_codes=mask_codes,
        iris_code_version=version,
    )


def _generate_address():
    return "0x" + hashlib.sha256(uuid.uuid4().bytes).hexdigest()[:40]


def _find_match(template):
    accounts = load_all_accounts()
    matcher = get_matcher()

    best_dist = float("inf")
    best_account = None

    for acc in accounts:
        try:
            dist = matcher.run(template, acc["template"])
            if dist < best_dist:
                best_dist = dist
                best_account = acc
        except Exception:
            continue

    if best_dist < MATCH_THRESHOLD:
        return best_account, best_dist

    return None, None


# ======================================================================
#  Extension API (prefix /api)
# ======================================================================

@app.route("/api/scan", methods=["POST"])
def api_scan():
    """Capture a photo from the Pi and identify the iris.

    No body required — the backend controls the camera.

    Returns:
        - {found: true, wallet: WalletData} if iris recognized
        - {found: false, irisHash: "..."} if iris unknown
    """
    try:
        template, iris_hash = _process_captured_frame()
        match, dist = _find_match(template)

        if match is not None:
            wallet_info = get_account_info(match["address"])
            wallet_info["irisHash"] = iris_hash
            return jsonify({
                "found": True,
                "wallet": wallet_info,
                "distance": round(dist, 4),
            })

        return jsonify({
            "found": False,
            "irisHash": iris_hash,
        })

    except RuntimeError as e:
        msg = str(e)
        if "EyeOrientationEstimationError" in msg or "VectorizationError" in msg or "Geometry" in msg:
            return jsonify({"error": "Iris not detected. Move your eye closer and keep it open."}), 422
        return jsonify({"error": f"Scan error: {msg}"}), 422
    except Exception as e:
        return jsonify({"error": f"Error: {e}"}), 500


@app.route("/api/register", methods=["POST"])
def api_register():
    """Register a new iris with a wallet name.

    Body JSON: { walletName: string, walletAddress?: string }
    Uses the cached iris template (from the last successful autoscan)
    to avoid re-capturing — the user does not need to stay
    in front of the camera.

    Returns:
        - {found: true, wallet: WalletData}
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    wallet_name = data.get("walletName", "").strip()
    if not wallet_name:
        return jsonify({"error": "walletName required"}), 400

    try:
        # Use the cached template from the last autoscan
        template = _last_template
        iris_hash = _last_iris_hash

        if template is None:
            return jsonify({"error": "No recent scan. Please scan your iris first."}), 400

        # Check that this iris doesn't already exist
        match, dist = _find_match(template)
        if match is not None:
            wallet_info = get_account_info(match["address"])
            wallet_info["irisHash"] = iris_hash
            return jsonify({
                "found": True,
                "wallet": wallet_info,
                "alreadyExists": True,
                "distance": round(dist, 4),
            })

        # Create the account — use the address provided by the extension or generate one
        address = data.get("walletAddress") or _generate_address()
        private_key = data.get("privateKey", "")
        iris_address = data.get("irisAddress", "")
        ledger_address = data.get("ledgerAddress", "")
        save_account(address, wallet_name, template, private_key=private_key, iris_address=iris_address, ledger_address=ledger_address)

        wallet_info = get_account_info(address)
        wallet_info["irisHash"] = iris_hash

        return jsonify({
            "found": True,
            "wallet": wallet_info,
        }), 201

    except Exception as e:
        return jsonify({"error": f"Error: {e}"}), 500


@app.route("/api/auth", methods=["POST"])
def api_auth():
    """Alias for /api/scan — compatibility with the existing extension."""
    return api_scan()


# --- MJPEG Stream for the extension ---

_last_jpeg = None  # cache the last encoded frame
_last_frame = None  # last raw frame (numpy)

# --- Auto-scan state ---
_autoscan_active = False
_autoscan_result = None  # result of the last auto-scan
_autoscan_event = threading.Event()
_last_template = None  # last successful iris template (for register without re-capture)
_last_iris_hash = None
_eye_cascade = cv2.CascadeClassifier(
    os.path.join(cv2.data.haarcascades, "haarcascade_eye.xml")
)


def _stream_reader_thread():
    """Thread that continuously reads frames and encodes them as JPEG."""
    global _last_jpeg, _last_frame, _stream_cap
    while True:
        if _scanning:
            time.sleep(0.05)
            continue
        try:
            with _cap_lock:
                if _stream_cap is None or not _stream_cap.isOpened():
                    time.sleep(0.5)
                    continue
                ret, frame = _stream_cap.read()
            if not ret:
                time.sleep(0.05)
                continue
            _last_frame = frame.copy()
            _, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 50])
            _last_jpeg = jpeg.tobytes()
        except Exception:
            time.sleep(0.3)


def _generate_mjpeg():
    """MJPEG frame generator for HTTP streaming."""
    while True:
        try:
            if _last_jpeg is None:
                time.sleep(0.05)
                continue
            yield (
                b'--frame\r\n'
                b'Content-Type: image/jpeg\r\n\r\n' +
                _last_jpeg +
                b'\r\n'
            )
            time.sleep(0.033)  # ~30 fps
        except GeneratorExit:
            return


@app.route("/api/stream")
def api_stream():
    """MJPEG stream from the Pi camera. Usage: <img src="/api/stream">"""
    return Response(
        _generate_mjpeg(),
        mimetype='multipart/x-mixed-replace; boundary=frame',
    )


# --- Auto-scan (mode Face ID) ---

def _autoscan_thread():
    """Thread that detects an eye and automatically launches the pipeline."""
    global _autoscan_result, _scanning

    consecutive_detections = 0
    REQUIRED_DETECTIONS = 3  # 3 consecutive detections before scan

    while True:
        if not _autoscan_active or _scanning:
            consecutive_detections = 0
            time.sleep(0.2)
            continue

        frame = _last_frame
        if frame is None:
            time.sleep(0.2)
            continue

        # Quick pre-detection with Haar cascade
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        eyes = _eye_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
        )

        if len(eyes) > 0:
            consecutive_detections += 1
        else:
            consecutive_detections = 0
            time.sleep(0.3)
            continue

        if consecutive_detections < REQUIRED_DETECTIONS:
            time.sleep(0.3)
            continue

        # Eye detected stably — launch the pipeline
        consecutive_detections = 0
        print("[AUTOSCAN] Eye detected, launching pipeline...")

        _scanning = True
        time.sleep(0.1)

        try:
            # Save the current frame
            tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
            cv2.imwrite(tmp.name, frame)
            tmp.close()

            try:
                template, iris_hash = process_image(tmp.name)

                # Store template for register/transaction without re-capture
                global _last_template, _last_iris_hash
                _last_template = template
                _last_iris_hash = iris_hash

                match, dist = _find_match(template)

                if match is not None:
                    wallet_info = get_account_info(match["address"])
                    wallet_info["irisHash"] = iris_hash
                    _autoscan_result = {
                        "status": "found",
                        "wallet": wallet_info,
                        "distance": round(dist, 4),
                    }
                    print(f"[AUTOSCAN] MATCH — {match['address'][:16]}...")
                else:
                    _autoscan_result = {
                        "status": "unknown",
                        "irisHash": iris_hash,
                    }
                    print(f"[AUTOSCAN] Unknown iris — hash={iris_hash}")

                _autoscan_event.set()

            except Exception as e:
                msg = str(e)
                if "EyeOrientationEstimationError" in msg or "VectorizationError" in msg or "Geometry" in msg:
                    print("[AUTOSCAN] Iris poorly framed, retrying...")
                else:
                    print(f"[AUTOSCAN] Pipeline error: {msg}")
                # Don't report the error, just retry
                time.sleep(1)
                continue
            finally:
                os.unlink(tmp.name)

        finally:
            _scanning = False

        # After a successful scan, wait before rescanning
        time.sleep(3)


@app.route("/api/autoscan", methods=["GET"])
def api_autoscan():
    """SSE endpoint — activates auto-scan and sends the result when ready.

    The extension connects here with EventSource.
    The backend detects the eye automatically and returns the result.
    """
    global _autoscan_active, _autoscan_result

    def generate():
        global _autoscan_active, _autoscan_result
        _autoscan_active = True
        _autoscan_result = None
        _autoscan_event.clear()

        # Send a heartbeat to confirm the connection
        yield f"data: {json.dumps({'status': 'scanning'})}\n\n"

        # Send heartbeats while waiting
        while True:
            got_result = _autoscan_event.wait(timeout=2.0)
            if got_result and _autoscan_result is not None:
                result = _autoscan_result
                _autoscan_result = None
                _autoscan_event.clear()
                _autoscan_active = False
                yield f"data: {json.dumps(result)}\n\n"
                return
            # Heartbeat to keep the connection alive
            yield f"data: {json.dumps({'status': 'scanning'})}\n\n"

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        },
    )


@app.route("/api/autoscan/stop", methods=["POST"])
def api_autoscan_stop():
    """Stop the auto-scan."""
    global _autoscan_active
    _autoscan_active = False
    return jsonify({"status": "stopped"})


# ======================================================================
#  Direct API (image upload)
# ======================================================================

@app.route("/enroll", methods=["POST"])
def enroll():
    if "image" not in request.files:
        return jsonify({"error": "'image' field required"}), 400

    file = request.files["image"]
    eye_side = request.form.get("eye_side", "left")
    wallet_name = request.form.get("wallet_name", "Wallet")

    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    file.save(tmp.name)
    tmp.close()

    try:
        template, iris_hash = process_image(tmp.name, eye_side)
        match, dist = _find_match(template)

        if match is not None:
            return jsonify({
                "address": match["address"],
                "hash": iris_hash,
                "new": False,
                "distance": round(dist, 4),
            }), 200

        address = _generate_address()
        save_account(address, wallet_name, template, eye_side)

        return jsonify({
            "address": address,
            "hash": iris_hash,
            "new": True,
        }), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        os.unlink(tmp.name)


@app.route("/identify", methods=["POST"])
def identify():
    if "image" not in request.files:
        return jsonify({"error": "'image' field required"}), 400

    file = request.files["image"]
    eye_side = request.form.get("eye_side", "left")

    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    file.save(tmp.name)
    tmp.close()

    try:
        template, iris_hash = process_image(tmp.name, eye_side)
        match, dist = _find_match(template)

        if match is not None:
            return jsonify({
                "address": match["address"],
                "hash": iris_hash,
                "distance": round(dist, 4),
                "known": True,
            }), 200

        return jsonify({"hash": iris_hash, "known": False}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        os.unlink(tmp.name)


@app.route("/accounts", methods=["GET"])
@app.route("/api/accounts", methods=["GET"])
def list_accounts():
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT address, wallet_name, balance, created_at FROM accounts"
    ).fetchall()
    conn.close()

    return jsonify({
        "count": len(rows),
        "accounts": [
            {
                "address": addr,
                "walletName": name,
                "balance": bal,
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts)),
            }
            for addr, name, bal, ts in rows
        ],
    })


@app.route("/accounts/<address>", methods=["DELETE"])
def remove_account(address):
    if delete_account(address):
        return jsonify({"message": "Account deleted", "address": address}), 200
    return jsonify({"error": "Account not found"}), 404


# --- Ledger Bridge relay ---
_ledger_result = None

@app.route("/api/ledger-result", methods=["POST"])
def post_ledger_result():
    global _ledger_result
    _ledger_result = request.get_json()
    return jsonify({"status": "ok"})

@app.route("/api/ledger-result", methods=["GET"])
def get_ledger_result():
    global _ledger_result
    if _ledger_result is None:
        return jsonify({"pending": True})
    result = _ledger_result
    _ledger_result = None
    return jsonify(result)

@app.route("/api/ledger-result", methods=["DELETE"])
def clear_ledger_result():
    global _ledger_result
    _ledger_result = None
    return jsonify({"status": "cleared"})


@app.route("/health", methods=["GET"])
def health():
    conn = sqlite3.connect(DB_PATH)
    count = conn.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]
    conn.close()

    stream_ok = _stream_cap is not None and _stream_cap.isOpened()
    return jsonify({
        "status": "ok",
        "accounts": count,
        "threshold": MATCH_THRESHOLD,
        "pi_stream": "connected" if stream_ok else "disconnected",
        "pi_ip": PI_IP,
    })


# --- Main ---

if __name__ == "__main__":
    print("=" * 60)
    print("  IrisGate Backend")
    print("=" * 60)
    print()
    print("  Loading iris model...")
    get_pipeline()
    print("  Model loaded!")
    print()
    init_db()

    # Start the Pi stream + reader thread
    print("  Connecting to Pi...")
    try:
        _ensure_pi_stream()
        t = threading.Thread(target=_stream_reader_thread, daemon=True)
        t.start()
        t2 = threading.Thread(target=_autoscan_thread, daemon=True)
        t2.start()
        print("  Pi stream connected!")
    except Exception as e:
        print(f"  [WARN] Pi not available: {e}")
        print("  Stream will start on first scan.")
    print(f"  DB: {DB_PATH}")
    print(f"  Pi: {PI_USER}@{PI_IP}:{PI_STREAM_PORT}")
    print(f"  Match threshold: {MATCH_THRESHOLD}")
    print()
    print("  Extension endpoints:")
    print("    POST /api/scan      — scan iris via Pi")
    print("    POST /api/register  — create an account")
    print("    GET  /api/accounts  — list accounts")
    print()
    print("  Direct endpoints:")
    print("    POST /enroll    — enroll (upload image)")
    print("    POST /identify  — identify (upload image)")
    print("    GET  /health    — status")
    print()
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
