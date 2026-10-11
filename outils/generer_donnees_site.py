#!/usr/bin/env python3
"""Genere docs/donnees.js a partir de index/index.json pour l'explorateur web.

Usage : python3 outils/generer_donnees_site.py

Le fichier produit est un script (et non un JSON) afin que la page
docs/index.html fonctionne aussi bien ouverte directement depuis le disque
(file://) que servie par GitHub Pages.
"""
import json
import pathlib
import re

RACINE = pathlib.Path(__file__).resolve().parent.parent
SOURCE = RACINE / "index" / "index.json"
CIBLE = RACINE / "docs" / "donnees.js"

# Regroupement des types d'actes (le champ "type" est parfois tres detaille).
GROUPES_TYPES = [
    ("contrat de mariage", "contrat de mariage"),
    ("mariage", "contrat de mariage"),
    ("testament", "testament"),
    ("codicille", "testament"),
    ("revente", "vente"),
    ("ratification de vente", "vente"),
    ("vente", "vente"),
    ("donation", "donation"),
    ("transaction", "transaction"),
    ("quittance", "quittance"),
    ("échange", "échange"),
    ("echange", "échange"),
    ("obligation", "obligation"),
    ("bail", "bail"),
    ("partage", "partage"),
    ("inventaire", "inventaire"),
    ("cession", "cession / subrogation"),
    ("subrogation", "cession / subrogation"),
    ("démission", "démission / désistement"),
    ("désistement", "démission / désistement"),
    ("constitution de rente", "constitution de rente"),
    ("procuration", "procuration"),
    ("contrat d'apprentissage", "apprentissage"),
]


def groupe_type(t):
    t = (t or "").strip().lower()
    for prefixe, groupe in GROUPES_TYPES:
        if t.startswith(prefixe):
            return groupe
    if t.startswith("autre"):
        return "autre"
    return t or "inconnu"


def notaire_normalise(n):
    n = (n or "").upper()
    for nom in ("SOURZAT", "PAGÈS", "PAGES", "PAYEN"):
        if nom in n:
            return "PAGÈS" if nom == "PAGES" else nom
    return "non identifié"


def lieu_normalise(l):
    l = re.sub(r"\(.*?\)|\[.*?\]", "", l or "")
    l = re.sub(r"[?\[\]]", "", l).strip(" ,;")
    return l or "non précisé"


def main():
    donnees = json.loads(SOURCE.read_text(encoding="utf-8"))
    actes = []
    for a in donnees["actes"]:
        actes.append({
            "id": a["id"],
            "chemin": a.get("chemin", ""),
            "type": a.get("type", ""),
            "tg": groupe_type(a.get("type")),
            "date": a.get("date_acte", ""),
            "lieu": a.get("lieu", ""),
            "lg": lieu_normalise(a.get("lieu")),
            "notaire": a.get("notaire", ""),
            "ng": notaire_normalise(a.get("notaire")),
            "depot": a.get("depot", ""),
            "cote": a.get("cote", ""),
            "etat": a.get("etat_transcription", ""),
            "confiance": a.get("confiance", ""),
            "personnes": [
                {
                    "nom": p.get("nom", ""),
                    "prenom": p.get("prenom", ""),
                    "graphies": p.get("graphies", []),
                    "role": p.get("role", ""),
                    "profession": p.get("profession", ""),
                    "residence": p.get("residence", ""),
                    "filiation": p.get("filiation", ""),
                }
                for p in a.get("personnes", [])
            ],
            "lieux": a.get("lieux_cites", []),
            "sommes": a.get("sommes", []),
            "mots": a.get("mots_cles", []),
            "resume": a.get("resume", ""),
        })
    sortie = {"genere_le": donnees.get("genere_le", ""), "actes": actes}
    CIBLE.write_text(
        "window.INDEX_NOTARIAT = "
        + json.dumps(sortie, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"{len(actes)} actes ecrits dans {CIBLE.relative_to(RACINE)}")


if __name__ == "__main__":
    main()
