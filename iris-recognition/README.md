# Iris Recognition

Systeme de reconnaissance d'iris qui identifie des personnes a partir de photos de leurs yeux. Chaque iris unique recoit un hash deterministe (ex: `3ca5be7121cec71d`). Deux photos du meme oeil donnent le meme hash.

## Comment ca marche

Le pipeline suit l'algorithme de Daugman, implemente par [open-iris](https://github.com/worldcoin/open-iris) (Worldcoin) :

1. **Segmentation** — un reseau de neurones detecte la pupille, l'iris et les paupieres
2. **Normalisation** — l'anneau iris est deroule en bande rectangulaire (rubber sheet model)
3. **Encodage** — des filtres de Gabor extraient la texture et l'encodent en IrisCode binaire (~8192 bits)
4. **Matching** — la distance de Hamming entre deux IrisCodes determine si c'est le meme iris (< 0.35 = match)

Le hash est un SHA-256 tronque de l'IrisCode.

## Installation

```bash
python3 -m venv .venv
source .venv/bin/activate

pip install "setuptools>=69"
pip install "pydantic>=1.10,<2"

# Cloner open-iris et relacher les contraintes de version
git clone --depth 1 https://github.com/worldcoin/open-iris.git
cd open-iris
sed -i 's/==/>=/' requirements/base.txt requirements/server.txt
IRIS_ENV=SERVER pip install -e .
cd ..
```

## Utilisation

### Comparer deux images

```bash
python iris_recognition.py compare photo1.jpg photo2.jpg
```

Sortie :
```
Image 1: hash=3ca5be7121cec71d
Image 2: hash=248f233dbdceef9e
Distance de Hamming: 0.2454
Resultat: MEME IRIS
```

### Identifier plusieurs images

Donne une liste d'images, le programme regroupe automatiquement celles qui appartiennent au meme iris :

```bash
python iris_recognition.py identify *.jpg
```

Sortie :
```
photo1.jpg -> iris:3ca5be7121cec71d (nouveau)
photo2.jpg -> iris:3ca5be7121cec71d (connu, dist=0.0478)
photo3.jpg -> iris:6d547580d0150693 (nouveau)
photo4.jpg -> iris:6d547580d0150693 (connu, dist=0.1146)

2 iris unique(s) detecte(s)
```

### Utiliser comme module Python

```python
from iris_recognition import process_image, compare, IrisDB

# Comparer deux images
t1, hash1 = process_image("oeil1.jpg")
t2, hash2 = process_image("oeil2.jpg")
dist = compare(t1, t2)
print(f"Distance: {dist:.4f}, Match: {dist < 0.35}")

# Base de donnees d'iris
db = IrisDB(threshold=0.35)
hash, dist, known = db.enroll("oeil1.jpg")  # enregistre
hash, dist = db.identify("oeil2.jpg")       # identifie
```

## Distances typiques

| Comparaison | Distance | Verdict |
|-------------|----------|---------|
| Meme iris, meme session | 0.01 - 0.10 | Match |
| Meme iris, sessions differentes | 0.10 - 0.27 | Match |
| Iris differents | 0.42 - 0.50 | Pas match |
| Jumeaux (iris differents) | 0.42 - 0.48 | Pas match |
| Seuil de decision | **0.35** | |

## Notes

- L'oeil gauche et l'oeil droit d'une meme personne ont des iris **completement differents** (les motifs se forment aleatoirement pendant le developpement foetal)
- Fonctionne avec des photos couleur (telephone) et infrarouge (capteurs specialises)
- Le premier appel est plus lent (~10s) car le modele de segmentation est telecharge depuis HuggingFace
