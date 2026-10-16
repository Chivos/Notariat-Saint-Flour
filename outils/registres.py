#!/usr/bin/env python3
"""Liste des registres couverts, d'après les noms des dossiers de scans.

Les fiches actes/*/acte.md citent le chemin des images, par exemple
« ...\\Analyses_notaires\\AD15_3 E 263-16_Sourzat_07.1658\\Acte_005_p016-019\\... ».
Le nom du dossier donne la cote du registre aux AD du Cantal, le notaire et la
période du registre (07.1658 = à partir de juillet 1658 ; 1655-1657 ; 1664-5).

Usage : python3 outils/registres.py [fichier_sortie]   (défaut : registres.json)
Lancé automatiquement par le workflow de publication du site.
"""
import json
import pathlib
import re
import sys

RACINE = pathlib.Path(__file__).resolve().parent.parent
DOSSIER = re.compile(r"Analyses_notaires[\\/]+(AD\d+_([^_\\/]+)_([^_\\/]+)_([^\\/'\"\n]+?))[\\/]")
DATE = re.compile(r"^date_acte:\s*['\"]?(\d{4}-\d{2}-\d{2})", re.M)


def periode(brut):
    """'07.1658' -> (1658, 1658, 7) ; '1655-1657' -> (1655, 1657, None) ; '1664-5' -> (1664, 1665, None)."""
    m = re.fullmatch(r"(\d{1,2})\.(\d{4})", brut)
    if m:
        return int(m.group(2)), int(m.group(2)), int(m.group(1))
    m = re.fullmatch(r"(\d{4})(?:-(\d{1,4}))?", brut)
    if m:
        debut = int(m.group(1))
        fin = m.group(2)
        if fin:
            fin = int(m.group(1)[: 4 - len(fin)] + fin)  # « 1664-5 » -> 1665
        return debut, fin or debut, None
    return None, None, None


def cle_tri(cote):
    return [int(n) if n.isdigit() else n for n in re.findall(r"\d+|\D+", cote)]


def main():
    sortie = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else RACINE / "registres.json"
    registres = {}
    for fiche in sorted(RACINE.glob("actes/*/acte.md")):
        texte = fiche.read_text(encoding="utf-8", errors="replace")
        m = DOSSIER.search(texte)
        if not m:
            continue
        dossier, cote, notaire, brut = m.groups()
        r = registres.setdefault(cote, {
            "cote": cote, "dossier": dossier, "notaire": notaire, "periode": brut,
            "fiches": 0, "premiere_date": None, "derniere_date": None,
        })
        r["fiches"] += 1
        d = DATE.search(texte)
        if d and not d.group(1).startswith("0000"):
            date = d.group(1)
            if not r["premiere_date"] or date.replace("-00", "-99") < r["premiere_date"].replace("-00", "-99"):
                r["premiere_date"] = date
            if not r["derniere_date"] or date > r["derniere_date"]:
                r["derniere_date"] = date
    liste = []
    for r in registres.values():
        r["annee_debut"], r["annee_fin"], r["mois_debut"] = periode(r["periode"])
        liste.append(r)
    liste.sort(key=lambda r: cle_tri(r["cote"]))
    sortie.write_text(json.dumps({"registres": liste}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(liste)} registres écrits dans {sortie}")


if __name__ == "__main__":
    main()
