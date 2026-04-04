"""Compare deux scan reports pour verifier si les iriscodes correspondent au meme oeil.

Usage: python test_match.py report1.txt report2.txt
"""

import sys
import re
import numpy as np

sys.path.insert(0, '.')
from config import MATCH_THRESHOLD


def parse_iriscode_hex(filepath: str) -> bytes:
    """Extrait l'iriscode HEX depuis un fichier de scan report."""
    with open(filepath, 'r') as f:
        content = f.read()

    # Trouver la section HEX
    match = re.search(r'HEX \(\d+ bytes\) :\n((?:\s+[0-9a-f]+\n?)+)', content)
    if not match:
        print(f"[ERREUR] Pas de section HEX trouvee dans {filepath}")
        sys.exit(1)

    hex_lines = match.group(1).strip().split('\n')
    hex_str = ''.join(line.strip() for line in hex_lines)
    return bytes.fromhex(hex_str)


def hamming_distance(a: bytes, b: bytes) -> float:
    """Distance de Hamming normalisee entre deux templates."""
    arr_a = np.frombuffer(a, dtype=np.uint8)
    arr_b = np.frombuffer(b, dtype=np.uint8)
    xor = np.bitwise_xor(arr_a, arr_b)
    diff_bits = sum(bin(byte).count('1') for byte in xor)
    total_bits = len(a) * 8
    return diff_bits / total_bits


def main():
    if len(sys.argv) != 3:
        print("Usage: python test_match.py report1.txt report2.txt")
        sys.exit(1)

    file1, file2 = sys.argv[1], sys.argv[2]

    print("=" * 60)
    print("  IRISWALLET — Comparaison IrisCode")
    print("=" * 60)
    print()

    code1 = parse_iriscode_hex(file1)
    code2 = parse_iriscode_hex(file2)

    print(f"  Fichier 1 : {file1}")
    print(f"    -> {len(code1)} bytes ({len(code1) * 8} bits)")
    print(f"    -> HEX : {code1.hex()[:64]}...")
    print()
    print(f"  Fichier 2 : {file2}")
    print(f"    -> {len(code2)} bytes ({len(code2) * 8} bits)")
    print(f"    -> HEX : {code2.hex()[:64]}...")
    print()

    if len(code1) != len(code2):
        print(f"  [ERREUR] Tailles differentes : {len(code1)} vs {len(code2)} bytes")
        sys.exit(1)

    dist = hamming_distance(code1, code2)
    total_bits = len(code1) * 8
    diff_bits = int(dist * total_bits)

    print("  --- RESULTAT ---")
    print(f"    Distance de Hamming : {dist:.4f} ({diff_bits}/{total_bits} bits differents)")
    print(f"    Seuil               : {MATCH_THRESHOLD}")
    print()

    if dist < MATCH_THRESHOLD:
        print("  " + "*" * 56)
        print("  *                                                    *")
        print("  *   MATCH — Meme oeil detecte                        *")
        print(f"  *   Distance: {dist:.4f} < seuil: {MATCH_THRESHOLD}               *")
        print("  *                                                    *")
        print("  " + "*" * 56)
    else:
        print("  " + "-" * 56)
        print("  |                                                    |")
        print("  |   NO MATCH — Oeil different                        |")
        print(f"  |   Distance: {dist:.4f} > seuil: {MATCH_THRESHOLD}               |")
        print("  |                                                    |")
        print("  " + "-" * 56)

    print()


if __name__ == "__main__":
    main()
