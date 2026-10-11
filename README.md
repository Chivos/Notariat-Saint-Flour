# Notariat de Saint-Flour

Index des actes notariés dépouillés (minutes Sourzat, Pagès… — AD Cantal, 3 E 263 / 264).

- `actes/` : fiche complète de chaque acte (`acte.md` : métadonnées, transcription, notes).
- `index/` : index générés (`index.json` et leurs versions Markdown : actes, personnes, lieux).
- `docs/` : **explorateur web** des index.

## Explorateur web

Page interactive pour chercher dans les index par nom de famille, prénom, dates,
type d'acte, lieu, notaire, rôle ou texte libre, avec :

- proximité **orthographique** (I/J/Y, U/V, H muet, TH, PH, LH/NH occitans,
  S devant consonne, lettres doublées, finales muettes…) ;
- proximité **phonétique** (prononciation française : C/K/QU, G/J, S/Z,
  AU/EAU/O, nasales, « ille », consonnes finales muettes…) ;
- **tolérance** de 1 à 3 lettres ;
- **jokers** `?` (une lettre inconnue) et `*` (plusieurs lettres) : `Chaul*`, `B?nal`, `*ac` ;
- **équivalences de prénoms** anciens (Jehan = Jean, Anth.e = Antoine,
  Guilhen = Guillaume, Margte = Marguerite…) ;
- recherche dans les **graphies originales** ;
- recherche de **deux personnes dans le même acte** ;
- fiche détaillée de chaque acte (avec la transcription complète), export CSV, adresse partageable ;
- page **Statistiques** : période couverte, actes par année, par mois, par type et par notaire, noms, prénoms, lieux, rôles et professions les plus fréquents (un clic sur une barre lance la recherche correspondante).

### Mise à jour du site

Il suffit de pousser sur `main` les nouveaux fichiers (`actes/…/acte.md`,
`index/index.json`, etc.) : le workflow « Publier le site »
(`.github/workflows/site.yml`) republie automatiquement le site en
quelques minutes. Rien à générer à la main.

Réglage à faire une seule fois : *Settings → Pages → Build and deployment →
Source : GitHub Actions*. L'avancement de chaque publication est visible
dans l'onglet *Actions* du dépôt.

### Utilisation locale

Ouvrir `docs/index.html` dans un navigateur : l'index et les transcriptions
sont alors lus sur GitHub (connexion nécessaire).
