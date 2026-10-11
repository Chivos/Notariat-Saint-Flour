# Notariat de Saint-Flour

Index des actes notariés dépouillés (minutes Sourzat, Pagès… — AD Cantal, 3 E 263 / 264).

- `index/` : index générés (`index.json` et leurs versions Markdown : actes, personnes, lieux).
- `docs/` : **explorateur web** des index.
- `outils/` : scripts.

## Explorateur web

Page interactive pour chercher dans les index par nom de famille, prénom, dates,
type d'acte, lieu, notaire, rôle ou texte libre, avec :

- proximité **orthographique** (I/J/Y, U/V, H muet, TH, PH, LH/NH occitans,
  S devant consonne, lettres doublées, finales muettes…) ;
- proximité **phonétique** (prononciation française : C/K/QU, G/J, S/Z,
  AU/EAU/O, nasales, « ille », consonnes finales muettes…) ;
- **tolérance** de 1 à 3 lettres, recherche « commence par » / « contient » ;
- **équivalences de prénoms** anciens (Jehan = Jean, Anth.e = Antoine,
  Guilhen = Guillaume, Margte = Marguerite…) ;
- recherche dans les **graphies originales** ;
- recherche de **deux personnes dans le même acte** ;
- fiche détaillée de chaque acte, export CSV, adresse partageable.

### Utilisation

- En local : ouvrir `docs/index.html` dans un navigateur (aucun serveur nécessaire).
- En ligne : activer GitHub Pages (Settings → Pages → *Deploy from a branch*,
  branche principale, dossier `/docs`).

### Mise à jour des données

Après une mise à jour de `index/index.json` :

```sh
python3 outils/generer_donnees_site.py
```

qui régénère `docs/donnees.js`.
