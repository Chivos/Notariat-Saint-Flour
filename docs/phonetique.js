/*
 * Normalisation des noms et prénoms anciens (XVIIe s., Auvergne) pour la
 * recherche approchée.
 *
 *  - cleOrtho(s)    : neutralise les variations purement graphiques
 *                     (accents, casse, I/J, U/V, Y/I, H muet, TH, PH, LH, NH,
 *                     S devant consonne, lettres doublées, finales muettes).
 *  - clePhon(s)     : code la prononciation française (C/K/QU, G/J, S/Z,
 *                     AU/EAU/O, AI/EI/E, nasales, ILL, finales muettes...).
 *  - distance(a, b) : distance d'édition (Levenshtein) bornée.
 *  - prenomCanonique(s) : ramène un prénom (ou son abréviation ancienne)
 *                     à une forme de référence (Jehan -> JEAN, Anth.e -> ANTOINE).
 *
 * Fichier sans dépendance, utilisable dans le navigateur et sous Node.
 */
(function (global) {
  "use strict";

  // Majuscules sans accents ; ne garde que les lettres (et les espaces si demandé).
  function lettres(s, garderEspaces) {
    s = String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/Œ/g, "OE")
      .replace(/Æ/g, "AE");
    // Les marques critiques ([...], ?, ^) ne font pas partie du nom.
    s = s.replace(/[^A-Z\s'-]/g, "");
    return garderEspaces ? s.replace(/['-]/g, " ").replace(/\s+/g, " ").trim() : s.replace(/[^A-Z]/g, "");
  }

  function sansDoubles(s) {
    return s.replace(/(.)\1+/g, "$1");
  }

  // ---------------------------------------------------------------- ortho
  function cleOrtho(s) {
    s = lettres(s);
    if (!s) return "";
    s = s
      .replace(/Y/g, "I")
      .replace(/J/g, "I")
      .replace(/W/g, "V")
      .replace(/V/g, "U")
      .replace(/NH/g, "GN") // Vernhe = Vergne
      .replace(/ILH/g, "ILL") // Guilhaume = Guillaume
      .replace(/LH(?=[AEIOU])/g, "LI") // Chaulhaguet = Chauliaguet
      .replace(/LH/g, "ILL") // Breulh = Breuil
      .replace(/TH/g, "T") // Anthoine = Antoine
      .replace(/PH/g, "F") // Phelip = Felip
      .replace(/([^CS])H/g, "$1") // H muet (Jehan = Jean), sauf CH/SH
      .replace(/^H/, "")
      .replace(/CT/g, "T") // Benoict = Benoit
      .replace(/(.)S(?=[^AEIOUS])/g, "$1"); // Estienne = Etienne, Chastel = Chatel
    s = sansDoubles(s);
    s = s.replace(/[SXZ]+$/, ""); // Pagès / Pagez
    if (s.length > 2) s = s.replace(/E$/, "");
    if (s.length > 2) s = s.replace(/D$/, "T"); // Benoid = Benoit
    return s;
  }

  // ---------------------------------------------------------------- phon
  var V = "AEIOUY";
  function estVoyelle(c) {
    return c !== undefined && V.indexOf(c) >= 0;
  }

  function clePhon(s) {
    s = lettres(s);
    if (!s) return "";
    s = s.replace(/Y/g, "I").replace(/W/g, "V");
    // I/U consonnes de l'ancienne graphie : Iean, Iacques, Uidal
    s = s.replace(/^I(?=[AEOU])/, "J").replace(/^U(?=[AEIO])/, "V");
    s = s
      .replace(/NH/g, "GN")
      .replace(/ILH/g, "ILL")
      .replace(/LH(?=[AEIOU])/g, "LI")
      .replace(/LH/g, "ILL")
      .replace(/SCH/g, "x")
      .replace(/CH/g, "x")
      .replace(/SH/g, "x")
      .replace(/PH/g, "F")
      .replace(/TH/g, "T")
      .replace(/H/g, "")
      .replace(/GN/g, "N")
      .replace(/CT/g, "T")
      .replace(/QU/g, "K")
      .replace(/Q/g, "K")
      .replace(/GU(?=[EI])/g, "g")
      // mouillures : Bataille, Soleil, Fenouil, Breuil (y = son « ille »)
      .replace(/([AEOU])ILL/g, "$1y")
      .replace(/([AEOU])IL$/, "$1y")
      // consonnes
      .replace(/G(?=[EI])/g, "J")
      .replace(/G/g, "g")
      .replace(/C(?=[EI])/g, "S")
      .replace(/CK/g, "K")
      .replace(/C/g, "K")
      .replace(/X$/, "")
      .replace(/X/g, "KS")
      .replace(/Z/g, "S")
      .replace(/([AEIOU])S(?=[^AEIOUSy])/g, "$1") // Estienne, Chastel
      // nasales (devant consonne ou en fin de mot)
      .replace(/[AE]IN(?![AEIOUNy])|[AE]IM(?![AEIOUMy])|IN(?![AEIOUNy])|IM(?![AEIOUMNy])|UN(?![AEIOUNy])/g, "3")
      .replace(/[AE]N(?![AEIOUNy])|[AE]M(?![AEIOUMy])/g, "1")
      .replace(/ON(?![AEIOUNy])|OM(?![AEIOUMy])/g, "2")
      // voyelles composées
      .replace(/EAU/g, "O")
      .replace(/AU/g, "O")
      .replace(/OEU/g, "E")
      .replace(/EU/g, "E")
      .replace(/OU/g, "w")
      .replace(/OI/g, "wA")
      .replace(/AI|EI/g, "E")
      // finales muettes : Rouger = Rougé, Cussac = Cussat (occitan)
      .replace(/(ER|EZ|ET)$/, "E")
      .replace(/([AEIOUwR1-3])K$/, "$1");
    s = sansDoubles(s);
    for (var i = 0; i < 3; i++) {
      s = s.replace(/[SXTD]$/, "");
      if (s.length > 2) s = s.replace(/E$/, "");
    }
    // S intervocalique = Z ; déjà fusionnés. E muet intérieur après voyelle.
    s = s.replace(/([AIOUw])E(?=[^AEIOU123wy]|$)/g, "$1");
    return sansDoubles(s);
  }

  // ---------------------------------------------------------------- distance
  function distance(a, b, max) {
    if (a === b) return 0;
    var la = a.length, lb = b.length;
    if (max === undefined) max = Infinity;
    if (Math.abs(la - lb) > max) return max + 1;
    if (!la) return lb;
    if (!lb) return la;
    var prec = new Array(lb + 1), cour = new Array(lb + 1), j;
    for (j = 0; j <= lb; j++) prec[j] = j;
    for (var i = 1; i <= la; i++) {
      cour[0] = i;
      var minLigne = i;
      var ca = a.charCodeAt(i - 1);
      for (j = 1; j <= lb; j++) {
        var cout = ca === b.charCodeAt(j - 1) ? 0 : 1;
        var v = Math.min(prec[j] + 1, cour[j - 1] + 1, prec[j - 1] + cout);
        cour[j] = v;
        if (v < minLigne) minLigne = v;
      }
      if (minLigne > max) return max + 1;
      var t = prec; prec = cour; cour = t;
    }
    return prec[lb];
  }

  // ---------------------------------------------------------------- prénoms
  // Variantes et abréviations anciennes -> forme de référence. Les clés sont
  // comparées après cleOrtho, donc inutile d'y lister Anthoine, Estienne,
  // Jehan, Guilhaume, Izabeau... (déjà ramenés par la normalisation).
  var EQUIV_PRENOMS = {
    ANTOINE: ["ANTHE", "ANTE", "ANTH", "ANT", "ANTOINE", "ANTONI", "ANTONY", "ANTHONY", "ANTONIN"],
    ANTOINETTE: ["ANTHONIE", "ANTONIE", "ANTONIA", "ANTTE", "ANTHETTE"],
    JEAN: ["IEAN", "IEHAN", "IAN", "IOAN", "IOANNES", "IOHANNES", "IN", "IEHAN"],
    JEANNE: ["IEANNE", "IEHANNE", "IANE", "IOANNA", "IANNE"],
    JACQUES: ["IACQ", "IACQS", "IACQUES", "IAQUES", "IAQUE", "IACME", "IACOB", "IACQE"],
    PIERRE: ["PIERE", "PEIRE", "PEYRE", "PETRUS", "PRE"],
    GUILLAUME: ["GUILL", "GUILLE", "GUILLEM", "GUILHEM", "GUILLEN", "GUILHEN", "GUILLIAUME", "GUILLIN", "GUILLIEN", "GUILEN", "GUILLAUMES"],
    ETIENNE: ["ESTIENE", "ETIENE", "ESTEUE", "ESTEUE", "ETEUE", "ESTEPHE", "STEPHANUS", "ESTNE", "ETNE", "STEPHANE"],
    MARGUERITE: ["MARG", "MARGTE", "MARGTE", "MARGARITE", "MARGUARITE", "MARGARIDE", "MARGUERITTE", "MARGOT"],
    CATHERINE: ["CATHE", "CATE", "CATARINE", "CATHARINE", "CATERINE", "CATHERINNE", "CATARINA"],
    ISABEAU: ["ISABEL", "ISABELLE", "IZABEAU", "IZABEL", "ELISABET", "ELISABETH", "ELIZABET", "ISABEAUD"],
    MADELEINE: ["MAGDELEINE", "MAGDELAINE", "MAGDELEINE", "MAGDELENE", "MAGDRE", "MAGDE", "MAGD", "MADELAINE", "MAGDELEYNE"],
    GERAUD: ["GERAUD", "GUIRAUD", "GIRAUD", "GUIRAL", "GERAL", "GERALD", "GERAULD", "GUERAUD"],
    FRANCOIS: ["FRANCOIS", "FRANCES", "FRANCES", "FRANCS", "FRAN", "FRANC"],
    FRANCOISE: ["FRANCOISE", "FRANCESE", "FRANCE", "FRANCOYSE"],
    CHRISTOPHE: ["CHRISTOFLE", "CRISTOFLE", "XPOFLE", "XPOFE", "CHRISTOFE", "CRISTOFE"],
    BARTHELEMY: ["BARTELEMI", "BARTHELEMI", "BARTELEMY", "BERTOMIEU", "BARTOMIEU", "BARTH"],
    MATHIEU: ["MATTHIEU", "MATIEU", "MATHIAS", "MATIAS", "MATHIEUS", "MATHIEU"],
    MICHEL: ["MICHAU", "MICHEAU", "MICHELL"],
    RAYMOND: ["RAIMOND", "RAMOND", "RAMON", "REMOND", "RAYMON"],
    RAYMONDE: ["RAIMONDE", "RAMONDE", "REMONDE"],
    VIDAL: ["VITAL", "UIDAL", "UITAL"],
    MARTIAL: ["MARSAL", "MARCIAL", "MARSAU"],
    BALTHAZAR: ["BALTHAZARD", "BALTAZAR", "BALTASAR", "BALTAZARD", "BAUTHAZAR"],
    GASPARD: ["GASPAR", "GASPART"],
    GEORGES: ["GEORGE", "IORGE", "IORDI", "GEORGI"],
    CLAUDE: ["GLAUDE", "CLAUDI"],
    BENOIT: ["BENOIST", "BENOICT", "BENOID", "BENEZET"],
    LOUIS: ["LOYS", "LOUYS", "LUIS"],
    LOUISE: ["LOUIZE", "LOYSE", "LOUYSE"],
    HUGUES: ["HUGUE", "HUGON", "HUGO", "UGUES"],
    AGNES: ["AGNEZ", "AGNE", "ANNES", "AGNEIS"],
    HELIPS: ["HELIS", "HELIPZ", "HELIX", "ALIX", "ELIPS", "HELIPSE"],
    MARIE: ["MARYE", "MARIA"],
    ANNE: ["ANE", "ANNA"],
    GILBERT: ["GIBERT", "GILBERT", "GIBT"],
    BAPTISTE: ["BAPTISTE", "BAPTISTE", "BAUPTISTE", "BATISTE", "BAPTE"],
    ANDRE: ["ANDRIEU", "ANDRIEUX", "ANDREU"],
    DELPHINE: ["DAUPHINE", "DALPHINE", "DELFINE"],
    GABRIELLE: ["GABRIELE", "GABRIELA"],
    GREGOIRE: ["GREGORI", "GREGORY"],
    PHILIPPE: ["PHELIP", "FELIP", "PHILIP", "PHELIPPE"],
    PHILIBERT: ["FILIBERT"],
    ASTORG: ["ASTORGUE", "ASTORC"],
    AMABLE: ["AMABLE", "AMABLES"],
    DOMINIQUE: ["DOMENGE", "DOMINGE", "DOMINIQUE"],
    BERNARD: ["BERNAT", "BERNARDE"],
    ESTIENNETTE: ["ETIENETE", "ESTIENETE"],
  };

  var tablePrenoms = null;
  function construireTable() {
    tablePrenoms = {};
    Object.keys(EQUIV_PRENOMS).forEach(function (ref) {
      var refCle = cleOrtho(ref);
      tablePrenoms[refCle] = refCle;
      EQUIV_PRENOMS[ref].forEach(function (v) {
        var k = cleOrtho(v);
        if (k && !tablePrenoms[k]) tablePrenoms[k] = refCle;
      });
    });
  }

  // Renvoie la forme de référence (clé orthographique) d'un prénom simple.
  function prenomCanonique(s) {
    if (!tablePrenoms) construireTable();
    var k = cleOrtho(s);
    return tablePrenoms[k] || k;
  }

  // Découpe un champ en mots (pour les prénoms composés et les graphies).
  function mots(s) {
    return lettres(s, true).split(" ").filter(function (m) { return m.length > 0; });
  }

  // Mots de liaison et titres à ignorer dans les graphies.
  var MOTS_VIDES = {};
  ("DE DU DES LA LE LES D L ET DIT DICT DITE DICTE ME MRE MR M MAISTRE MAITRE SR SIEUR " +
   "SRE DAME DAMLLE DLLE FEU FEUE HON HONNESTE VEFVE VEUVE FEMME FILS FILLE FEU LAD LED " +
   "DUD DUDIT LADITE AUD AUDIT PBRE A AU SA SON SES").split(" ").forEach(function (m) { MOTS_VIDES[m] = 1; });

  var api = {
    lettres: lettres,
    cleOrtho: cleOrtho,
    clePhon: clePhon,
    distance: distance,
    prenomCanonique: prenomCanonique,
    mots: mots,
    MOTS_VIDES: MOTS_VIDES,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Phonetique = api;
})(this);
