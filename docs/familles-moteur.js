/*
 * Reconstitution EXPLORATOIRE de familles à partir des index.
 *
 * 1. Extraction des liens de parenté écrits dans les champs « filiation » et
 *    « rôle » (« fils de feu Pierre ROCHE et de Jeanne ALAUIOL », « veuve
 *    d'Antoine MEYRE », « père de l'épouse », « épouse du testateur »…), plus
 *    les époux d'un même contrat de mariage.
 * 2. Regroupement des mentions d'un même nom (même prénom, même nom
 *    normalisés) en « individus » quand elles partagent un indice : même
 *    parent, même conjoint ou même enfant (jamais deux homonymes d'un même acte).
 * 3. Les personnes connues seulement par une filiation (« feu Pierre ROCHE »)
 *    deviennent des individus « déduits ».
 *
 * Tout cela repose sur des heuristiques : homonymes confondus et individus
 * dédoublés sont attendus. Fichier sans dépendance d'interface (testable sous Node).
 */
(function (global) {
  "use strict";

  var P = global.Phonetique || (typeof require !== "undefined" ? require("./phonetique.js") : null);

  // ------------------------------------------------------------------ outils
  function nettoyer(s) {
    return String(s || "").replace(/[’`]/g, "'").replace(/\(\s*\?\s*\)|\[\s*\?\s*\]/g, "")
      .replace(/[\[\]?]/g, "").replace(/\s+/g, " ").trim();
  }
  function cleNom(nom) { return P.cleOrtho(nom); }
  function plat(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  // Formes féminines que la clé orthographique confondrait avec le masculin (Jeanne = Jean…).
  var FEMININS = new Set(("JEANNE JEHANNE IEANNE IEHANNE JANE LOUISE LOYSE LOUYSE FRANCOISE MICHELLE GABRIELLE RAYMONDE DURANDE VIDALE " +
    "BERNARDE GERAUDE GUIRAUDE SIMONE DENISE PAULE JULIENNE MARTINE CLAUDINE ANDREE PHILIPPE").split(" "));
  function cleMot(mot) {
    var l = P.lettres(mot);
    return P.prenomCanonique(mot) + (FEMININS.has(l) || /(?:ETTE|ETE)$/.test(l) ? "*" : "");
  }
  function clePrenom(prenom) {
    var mots = P.mots(prenom);
    return mots.length ? cleMot(mots[0]) + (mots[1] ? "-" + cleMot(mots[1]) : "") : "";
  }
  function anneeDe(a) { var y = parseInt((a.date || "").slice(0, 4), 10); return y > 0 ? y : null; }

  var TITRES = /^(?:m\^?e|me|mre|m\^?re|mtre|maistre|maître|messire|sieur|sr|s\^?r|noble|honn?est?e|honnête|dame|damoiselle|demoiselle|dam\.?lle|dlle|vénérable|venerable|discret|frère|sœur)\.?\s+/i;
  var PRENOMS_COMPOSES = /^(?:Jean|Jeanne|Marie|Anne|Pierre|Louis|François|Claude)\s+(?:Baptiste|Pierre|Louis|François|Marie|Anne|Jacques|Antoine|Joseph|Hugues|Claude)$/i;
  var FEU = /^(?:feue?s?|défunte?s?|deffunte?s?)\s+/i;

  // Rôles « relatifs » : « de l'épouse », « du testateur »… -> début du rôle visé.
  var REFERENCES = [
    [/^(?:futur\s+)?époux\b/i, /^(?:futur\s+)?(?:époux|epoux|mari)\b/i],
    [/^(?:future\s+)?épouse\b/i, /^(?:future\s+)?(?:épouse|epouse)\b/i],
    [/^testat(?:eur|rice)\b/i, /^testat/i],
    [/^vende(?:ur|resse|use)\b/i, /^vende/i],
    [/^acqu[ée]re(?:ur|use)\b/i, /^acqu/i],
    [/^donat(?:eur|rice)\b/i, /^donat(?:eur|rice)/i],
    [/^donataire\b/i, /^donataire/i],
    [/^légataire\b/i, /^légataire/i],
    [/^héritière?\b/i, /^héritière?/i],
    [/^débit(?:eur|rice)\b/i, /^débit/i],
    [/^créanci(?:er|ère)\b/i, /^créanci/i],
    [/^défunte?\b/i, /^défunt/i],
  ];

  // Relation exprimée par le début d'un segment.
  var RELATION = /^(?:(?:probablement|vraisemblablement|sans doute|peut-être|semble-t-il|dit[e]?)\s+)?(?:(?:premier|première|second|seconde|deuxième|troisième|aîné|aînée|cadet|cadette|puîné|puînée|jeune)\s+)?(fils|filz|fille|enfants?|père|mère|épouse|femme|veuve|mari|époux|frère|sœur|soeur)\b((?:\s+(?:naturel(?:le)?|légitime|aîné(?:e)?|aisné|aisne|puîné(?:e)?|cadet(?:te)?|défunt(?:e)?|unique|majeur|mineur|en\s+(?:premières|secondes)\s+noces|puis\s+veuve|et\s+héritière?))*)\s+(d'|de\s+la\s+|de\s+l'|de\s+|du\s+|des\s+)(.+)$/i;

  function typeRelation(mot) {
    mot = mot.toLowerCase();
    if (/^(fils|filz|fille|enfant)/.test(mot)) return "enfant";      // le sujet est enfant de la cible
    if (/^(père|mère)/.test(mot)) return "parent";                   // le sujet est parent de la cible
    if (/^(épouse|femme|veuve|mari|époux)/.test(mot)) return "conjoint";
    if (/^(frère|sœur|soeur)/.test(mot)) return "fratrie";
    return null;
  }

  // Une cible : nom de personne ou rôle relatif (« l'épouse »).
  function analyserCible(texte, determinant) {
    var t = nettoyer(texte).replace(/^(?:de\s+la\s+|de\s+l'|de\s+|d'|du\s+|des\s+)/i, "");
    t = t.replace(/\s*[,(].*$/, "").replace(/\s+(?:selon|d'après|non|lecture|probable|probablement|dit|dict|dite)\b.*$/i, "").trim();
    var art = /^(?:l'|la\s+|le\s+)/i.test(t) || /^(du|de la|de l'|des)/i.test(determinant || "");
    var feu = false;
    var r = t.replace(/^(?:l'|la\s+|le\s+)/i, "");
    for (var i = 0; i < REFERENCES.length; i++) {
      if (REFERENCES[i][0].test(r) && (art || /^(testat|vende|acqu|donat|légat|hérit)/i.test(r))) return { ref: REFERENCES[i][1] };
    }
    for (var k = 0; k < 3; k++) {
      if (FEU.test(t)) { feu = true; t = t.replace(FEU, ""); }
      t = t.replace(TITRES, "");
    }
    var mots = t.split(" ").map(function (m) { return m.replace(/[^A-Za-zÀ-ÿ'-]/g, ""); }).filter(Boolean);
    var PARTICULE = /^(?:de|du|des|la|le|d'|del)$/i;
    var estNom = function (m) { return m.length > 1 && m === m.toUpperCase() && /[A-ZÀ-Þ]/.test(m); };
    var i0 = -1;
    for (var j = 0; j < mots.length; j++) if (estNom(mots[j])) { i0 = j; break; }
    var prenom = mots, n = "";
    if (i0 >= 0) {
      var debut = i0;
      while (debut > 0 && PARTICULE.test(mots[debut - 1])) debut--;
      var fin = i0;
      while (fin + 1 < mots.length && (estNom(mots[fin + 1]) || (PARTICULE.test(mots[fin + 1]) && fin + 2 < mots.length && estNom(mots[fin + 2])))) fin++;
      n = mots.slice(debut, fin + 1).join(" ").toUpperCase();
      prenom = mots.slice(0, debut);
    } else if (mots.length > 1 && /^[A-ZÀ-Þ]/.test(mots[mots.length - 1]) && !PRENOMS_COMPOSES.test(mots.join(" "))) {
      // Nom écrit en minuscules (« Pierre Vernhe ») : le dernier mot est le nom.
      n = mots[mots.length - 1].toUpperCase();
      prenom = mots.slice(0, -1);
    }
    // Un prénom commence par une majuscule (« apprenti », « testateur » n'en sont pas).
    prenom = prenom.filter(function (m) { return !PARTICULE.test(m) && /^[A-ZÀ-Þ]/.test(m); });
    // « Guillaume HUGON père » / « … fils » : distingue deux homonymes d'un même acte.
    var qualif = /\b(?:père|aîné|aisné|vieux)\b/i.test(t) ? "père" : /\b(?:fils|jeune|cadet)\b/i.test(t) ? "fils" : "";
    return { prenom: prenom.slice(0, 2).join(" "), nom: n, feu: feu, qualif: qualif };
  }

  // Analyse un texte (filiation ou rôle) -> liste de { type, cibles: [...] }.
  function extraireRelations(texte) {
    var res = [];
    String(texte || "").replace(/[’`]/g, "'").split(/\s*[;]\s*/).forEach(function (seg) {
      seg = seg.replace(/^[«"\s]+|[»"\s]+$/g, "");
      seg = seg.replace(/\[\s*\.\.\.\s*\]/g, "").replace(/[\[\]?]/g, "").replace(/\s+/g, " ").trim();
      var m = RELATION.exec(seg);
      if (!m) return;
      var type = typeRelation(m[1]);
      if (!type) return;
      var defunt = /défunt/i.test(m[2] || "");
      var reste = m[4];
      var parties = reste.split(/\s+et\s+(?=(?:de\s+|d'|du\s+)?)/i).slice(0, 3);
      var cibles = parties.map(function (p, i) { return analyserCible(p, i === 0 ? m[3] : ""); });
      if (defunt) cibles.forEach(function (c) { c.conjointDefunt = true; });
      res.push({ type: type, mot: m[1].toLowerCase(), cibles: cibles });
    });
    return res;
  }

  // ------------------------------------------------------------------ union-find
  // Union-find avec interdits : deux nœuds déclarés incompatibles (père et fils
  // homonymes…) ne se retrouvent jamais dans le même groupe, quel que soit l'ordre des unions.
  function UF() { this.p = new Map(); this.membres = new Map(); this.interdits = new Map(); }
  UF.prototype.trouver = function (x) {
    var p = this.p.get(x);
    if (p === undefined) { this.p.set(x, x); this.membres.set(x, [x]); return x; }
    if (p === x) return x;
    var r = this.trouver(p); this.p.set(x, r); return r;
  };
  UF.prototype.interdire = function (a, b) {
    [[a, b], [b, a]].forEach(function (pr) {
      if (!this.interdits.has(pr[0])) this.interdits.set(pr[0], []);
      this.interdits.get(pr[0]).push(pr[1]);
    }, this);
  };
  UF.prototype.unir = function (a, b) {
    a = this.trouver(a); b = this.trouver(b);
    if (a === b) return false;
    var self = this, mb = this.membres.get(b);
    var bloque = mb.some(function (x) {
      return (self.interdits.get(x) || []).some(function (y) { return self.trouver(y) === a; });
    });
    if (bloque) return false;
    if (mb.length > this.membres.get(a).length) { var t = a; a = b; b = t; mb = this.membres.get(b); }
    this.p.set(b, a);
    this.membres.set(a, this.membres.get(a).concat(mb));
    this.membres.delete(b);
    return true;
  };

  // ------------------------------------------------------------------ construction
  function construire(actes, mentions) {
    // Mentions exploitables : un nom et un prénom lisibles, hors notaires.
    var M = [];
    mentions.forEach(function (m) {
      var nom = nettoyer(m.p.nom), prenom = nettoyer(String(m.p.prenom || "").replace(/\(.*?\)/g, ""));
      var info = {
        m: m, acte: m.acte, nom: nom, prenom: prenom,
        kn: cleNom(nom), kp: clePrenom(prenom),
        notaire: /notaire/i.test(m.p.role) && !/père|mère|fils|fille/i.test(m.p.role),
        relations: extraireRelations(m.p.filiation).concat(extraireRelations(m.p.role)),
        liens: [], // { type, vers: info | virtuel, source, feu }
      };
      info.cle = info.kn && info.kp ? info.kn + "|" + info.kp : "";
      m._fam = info;
      M.push(info);
    });
    var parActe = new Map();
    M.forEach(function (x) {
      var l = parActe.get(x.acte.idx);
      if (!l) parActe.set(x.acte.idx, l = []);
      l.push(x);
    });

    // Résolution d'une cible dans l'acte (même acte d'abord).
    function resoudre(sujet, cible, type, autres) {
      var dansActe = parActe.get(sujet.acte.idx) || [];
      var prenomSujet = plat(P.mots(sujet.prenom)[0] || "").replace(/[^a-z]/g, "");
      if (cible.ref) {
        var t = dansActe.filter(function (y) { return y !== sujet && cible.ref.test(y.m.p.role); });
        return t.length ? { mention: t[0] } : null;
      }
      var nom = cible.nom;
      // Nom sous-entendu : le père porte le nom de l'enfant ; sinon le nom de la dernière cible nommée.
      if (!nom) {
        var nommee = autres.filter(function (c) { return c.nom; }).pop();
        if (type === "enfant" && cible === autres[0]) nom = sujet.nom;
        else if (nommee) nom = nommee.nom;
        else if (type === "fratrie" || type === "parent") nom = sujet.nom;
      }
      if (!cible.prenom || !nom) return null;
      var cle = cleNom(nom) + "|" + clePrenom(cible.prenom);
      var t2 = dansActe.filter(function (y) {
        if (y === sujet || y.cle !== cle) return false;
        // Un conjoint n'est ni l'enfant du sujet ni, s'il est dit « feu », une partie vivante de l'acte.
        if (type === "conjoint") {
          var ty = plat(y.m.p.role + " " + y.m.p.filiation);
          // Un conjoint n'est pas l'enfant du sujet (« fils de … et de <prénom du sujet> »).
          if (/\b(fils|fille|filz)\b/.test(ty) && prenomSujet && new RegExp("\\b(fils|fille|filz)\\b[^;]*\\b" + prenomSujet + "\\b").test(ty)) return false;
          if (cible.feu && !/defunt|deffunt|feue?\b/.test(ty)) return false;
        }
        return true;
      });
      if (t2.length > 1 && prenomSujet) {
        // Homonymes dans l'acte : on préfère celui dont la filiation cite le sujet en retour
        // (« mari de Marguerite BRAZE », « frère de Filipe HUGON »).
        var retour = { conjoint: "(mari|epoux|femme|epouse|veuve|veuf)", fratrie: "(frere|soeur|sœur)", enfant: "(pere|mere)", parent: "(fils|fille|filz|enfant)" }[type];
        var nomSujet = plat(sujet.nom).replace(/[^a-z]/g, "").slice(0, 4);
        var reRetour = retour && new RegExp("\\b" + retour + "\\b[^;]*?\\b" + prenomSujet + "\\b[^;]*?\\b" + nomSujet);
        var reciproques = reRetour ? t2.filter(function (y) { return reRetour.test(plat(y.m.p.role + " ; " + y.m.p.filiation)); }) : [];
        if (reciproques.length) t2 = reciproques;
      }
      if (t2.length > 1) {
        // Homonymes dans l'acte (père et fils) : on départage par le qualificatif ou le rôle.
        var texte = function (y) { return (y.m.p.role + " " + y.m.p.filiation).toLowerCase(); };
        var choix = t2.filter(function (y) {
          if (cible.qualif === "père") return /père|mari\b|veuf/.test(texte(y));
          if (cible.qualif === "fils") return /\bfils\b|héritier|jeune/.test(texte(y));
          if (type === "enfant") return /père|mère/.test(texte(y));
          if (type === "conjoint") return !/\bfils\b|\bfille\b/.test(texte(y)) || /\b(mari|époux|femme|épouse)\b/.test(texte(y));
          return false;
        });
        if (choix.length) t2 = choix;
      }
      if (t2.length) return { mention: t2[0] };
      return { virtuel: { cle: cle, nom: nom.toUpperCase(), prenom: cible.prenom, feu: cible.feu } };
    }

    var LIENS = []; // { a: info, b: info|virtuel, type: "parent"(a parent de b)|"conjoint"|"fratrie", acte, feuA, feuB }
    M.forEach(function (x) {
      if (!x.cle) return;
      x.relations.forEach(function (r) {
        r.cibles.forEach(function (c) {
          var res = resoudre(x, c, r.type, r.cibles);
          if (!res) return;
          var cibleInfo = res.mention || res.virtuel;
          if (res.mention && !res.mention.cle) return;
          // feu = la cible est dite défunte ; « mari défunt de… » = le sujet est défunt.
          var lien = { acte: x.acte };
          if (r.type === "enfant") { lien.type = "parent"; lien.a = cibleInfo; lien.b = x; lien.feuA = c.feu; }
          else if (r.type === "parent") { lien.type = "parent"; lien.a = x; lien.b = cibleInfo; lien.feuB = c.feu; lien.feuA = c.conjointDefunt; }
          else { lien.type = r.type; lien.a = x; lien.b = cibleInfo; lien.feuB = c.feu; lien.feuA = c.conjointDefunt; }
          LIENS.push(lien);
        });
      });
    });
    // Les deux époux d'un contrat de mariage.
    actes.forEach(function (a) {
      if (a.tg !== "contrat de mariage") return;
      var l = parActe.get(a.idx) || [];
      var ep = l.filter(function (y) { return y.cle && /^(?:futur\s+)?(?:époux|epoux)\b/i.test(y.m.p.role); })[0];
      var ee = l.filter(function (y) { return y.cle && /^(?:future\s+)?(?:épouse|epouse)\b/i.test(y.m.p.role); })[0];
      if (ep && ee) LIENS.push({ type: "conjoint", a: ep, b: ee, acte: a, mariage: true });
    });

    // ---- Regroupement des mentions en individus
    var uf = new UF();
    var virtuels = new Map();
    function noeud(o) {
      if (o.m) return "m" + o.m.acte.idx + ":" + o.m.ip;
      if (!virtuels.has(o.cle)) virtuels.set(o.cle, o);
      return "v" + o.cle;
    }
    M.forEach(function (x) { if (x.cle) uf.trouver(noeud(x)); });
    LIENS.forEach(function (l) { uf.trouver(noeud(l.a)); uf.trouver(noeud(l.b)); });
    // Interdits : deux mentions homonymes d'un même acte, ou un parent et son enfant homonymes.
    parActe.forEach(function (l) {
      for (var i = 0; i < l.length; i++) for (var j = i + 1; j < l.length; j++) {
        if (l[i].cle && l[i].cle === l[j].cle) uf.interdire(noeud(l[i]), noeud(l[j]));
      }
    });
    LIENS.forEach(function (l) {
      // Un parent et son enfant, deux conjoints : jamais la même personne.
      if (l.type === "parent" || l.type === "conjoint") uf.interdire(noeud(l.a), noeud(l.b));
    });

    // Indices portés par chaque mention : nom des parents, du conjoint, des enfants.
    var indices = new Map(); // indice -> [noeuds]
    function indice(x, i) {
      var k = x.cle + "#" + i;
      var l = indices.get(k);
      if (!l) indices.set(k, l = []);
      l.push(noeud(x));
    }
    function cleDe(o) { return o.m ? o.cle : o.cle; }
    LIENS.forEach(function (l) {
      if (l.type === "parent") {
        if (l.b.m) indice(l.b, "parent:" + cleDe(l.a));
        if (l.a.m) indice(l.a, "enfant:" + cleDe(l.b));
      } else if (l.type === "conjoint") {
        if (l.a.m) indice(l.a, "conjoint:" + cleDe(l.b));
        if (l.b.m) indice(l.b, "conjoint:" + cleDe(l.a));
      }
    });
    // Parents connus de chaque mention : deux homonymes ayant un parent commun mais
    // un autre parent différent (père remarié…) restent deux personnes distinctes.
    var parentsDe = new Map();
    LIENS.forEach(function (l) {
      if (l.type !== "parent" || !l.b.m) return;
      var n = noeud(l.b);
      if (!parentsDe.has(n)) parentsDe.set(n, new Set());
      parentsDe.get(n).add(cleDe(l.a));
    });
    // On compare les prénoms des parents : « Marguerite ROSSENE » et « Marguerite ROSSERE »
    // sont sans doute deux lectures de la même mère, « Marguerite » et « Maronne » non.
    function compatibles(a, b) {
      var pa = parentsDe.get(a), pb = parentsDe.get(b);
      if (!pa || !pb || pa.size < 2 || pb.size < 2) return true;
      var prenoms = function (set) { var r = new Set(); set.forEach(function (k) { r.add(k.split("|")[1]); }); return r; };
      var qa = prenoms(pa), qb = prenoms(pb), ok = true;
      qa.forEach(function (k) { if (!qb.has(k)) ok = false; });
      return ok;
    }
    // Conjoints connus de chaque mention, et date de l'acte, pour départager des homonymes.
    var conjointsDe = new Map(), dateDe = new Map();
    LIENS.forEach(function (l) {
      if (l.type !== "conjoint") return;
      [[l.a, l.b], [l.b, l.a]].forEach(function (c) {
        if (!c[0].m) return;
        var n = noeud(c[0]);
        if (!conjointsDe.has(n)) conjointsDe.set(n, new Set());
        conjointsDe.get(n).add(cleDe(c[1]));
      });
    });
    M.forEach(function (x) { if (x.cle) dateDe.set(noeud(x), x.acte.date || "9999"); });
    function conjointsGroupe(racine) {
      var r = new Set();
      (uf.membres.get(racine) || [racine]).forEach(function (n) { (conjointsDe.get(n) || new Set()).forEach(function (k) { r.add(k); }); });
      return r;
    }
    // Quand une mention peut rejoindre plusieurs homonymes distincts (deux sœurs Helipse, l'aînée
    // et la cadette), on choisit le plus cohérent : même conjoint d'abord, puis sans conjoint
    // connu ; une personne déjà mariée à quelqu'un d'autre ne passe qu'en dernier recours.
    indices.forEach(function (l) {
      l = l.slice().sort(function (a, b) { return (dateDe.get(a) || "").localeCompare(dateDe.get(b) || ""); });
      l.forEach(function (n, i) {
        var vues = new Set(), candidats = [];
        for (var j = 0; j < i; j++) {
          var r = uf.trouver(l[j]);
          if (r === uf.trouver(n) || vues.has(r)) continue;
          vues.add(r);
          if (compatibles(l[j], n)) candidats.push(r);
        }
        if (!candidats.length) return;
        var cn = conjointsGroupe(uf.trouver(n));
        var score = function (r) {
          var cc = conjointsGroupe(r);
          if (!cn.size || !cc.size) return 1;
          var commun = false;
          cc.forEach(function (k) { if (cn.has(k)) commun = true; });
          return commun ? 2 : 0;
        };
        candidats.sort(function (a, b) { return score(b) - score(a); });
        for (var k = 0; k < candidats.length; k++) if (uf.unir(candidats[k], n)) break;
      });
    });
    // Variantes de lecture d'un même proche : les parents d'un même enfant qui ont le même
    // prénom, ou les conjoints d'une même personne au même prénom et au nom presque identique.
    function prenomDe(o) { return o.cle.split("|")[1]; }
    function nomDe(o) { return o.cle.split("|")[0]; }
    // Prénoms proches : même forme de référence, ou prononciation à une lettre près
    // (Cibelle / Sibielle / Cibielle), sans jamais confondre masculin et féminin.
    function prenomsProches(a, b) {
      var ka = prenomDe(a), kb = prenomDe(b);
      if (ka === kb) return true;
      if (/\*/.test(ka) !== /\*/.test(kb)) return false;
      var pa = P.clePhon(P.mots(a.prenom)[0] || ""), pb = P.clePhon(P.mots(b.prenom)[0] || "");
      return Math.min(pa.length, pb.length) >= 4 && P.distance(pa, pb, 1) <= 1;
    }
    // Noms proches : même clé, ou prononciation à « tol » lettres près (ROZIERE / ROUZEYRE).
    function nomsProches(a, b, tol) {
      if (nomDe(a) === nomDe(b)) return true;
      var pa = P.clePhon(a.nom), pb = P.clePhon(b.nom);
      return Math.min(pa.length, pb.length) >= 4 && P.distance(pa, pb, tol) <= tol && P.distance(nomDe(a), nomDe(b), tol + 1) <= tol + 1;
    }
    function nomsCourtsProches(a, b) {
      var pa = P.clePhon(a.nom), pb = P.clePhon(b.nom);
      return Math.min(pa.length, pb.length) >= 3 && pa.slice(0, 2) === pb.slice(0, 2) && P.distance(pa, pb, 1) <= 1;
    }
        function unirProches(liste, test) {
      for (var i = 0; i < liste.length; i++) for (var j = i + 1; j < liste.length; j++) {
        if (test(liste[i], liste[j])) uf.unir(noeud(liste[i]), noeud(liste[j]));
      }
    }
    for (var passe = 0; passe < 3; passe++) {
      var parentsParEnfant = new Map(), enfantsParParent = new Map(), conjointsPar = new Map();
      var ajouter = function (map, cle, o) {
        var k = uf.trouver(noeud(cle));
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(o);
      };
      // Prénoms des parents connus de chaque groupe (pour ne pas réunir deux enfants de mères différentes).
      var prenomsParents = new Map();
      LIENS.forEach(function (l) {
        if (l.type !== "parent") return;
        var k = uf.trouver(noeud(l.b));
        if (!prenomsParents.has(k)) prenomsParents.set(k, new Set());
        prenomsParents.get(k).add(prenomDe(l.a));
      });
      var memesParents = function (a, b) {
        var pa = prenomsParents.get(uf.trouver(noeud(a))), pb = prenomsParents.get(uf.trouver(noeud(b)));
        if (!pa || !pb || pa.size < 2 || pb.size < 2) return true;
        var ok = true;
        pa.forEach(function (k) { if (!pb.has(k)) ok = false; });
        return ok;
      };
      LIENS.forEach(function (l) {
        if (l.type === "parent") { ajouter(parentsParEnfant, l.b, l.a); ajouter(enfantsParParent, l.a, l.b); }
        else if (l.type === "conjoint") { ajouter(conjointsPar, l.a, l.b); ajouter(conjointsPar, l.b, l.a); }
      });
      // Deux parents d'un même enfant au prénom proche : une seule personne.
      parentsParEnfant.forEach(function (l) { unirProches(l, prenomsProches); });
      // Deux enfants d'un même parent, même nom et prénom proche : une seule personne
      // (deux enfants cités dans le même acte restent distincts grâce aux interdits).
      enfantsParParent.forEach(function (l) {
        unirProches(l, function (a, b) { return prenomsProches(a, b) && nomsProches(a, b, 1) && memesParents(a, b); });
      });
      // Deux conjoints d'une même personne au prénom et au nom proches : une seule personne.
      // (noms courts acceptés si le début concorde : BROHA / BRAZE, conjoints d'un même homme).
      conjointsPar.forEach(function (l) { unirProches(l, function (a, b) { return prenomsProches(a, b) && (nomsProches(a, b, 2) || nomsCourtsProches(a, b)); }); });
      // Deux couples aux noms et prénoms proches des deux côtés (ROCHE ∞ Maronne FAYON /
      // ROCHER ∞ Marianne FAYON) : un seul couple.
      if (passe === 0) {
        // Ici les deux conjoints se confirment l'un l'autre : on tolère un peu plus d'écart.
        var personneProche = function (a, b) {
          var nomOk = P.clePhon(a.nom) === P.clePhon(b.nom) || nomsProches(a, b, 1);
          if (!nomOk) return false;
          if (prenomsProches(a, b)) return true;
          if (/\*/.test(prenomDe(a)) !== /\*/.test(prenomDe(b))) return false;
          var pa = P.clePhon(P.mots(a.prenom)[0] || ""), pb = P.clePhon(P.mots(b.prenom)[0] || "");
          return Math.min(pa.length, pb.length) >= 5 && P.distance(pa, pb, 2) <= 2;
        };
        var parSon = new Map();
        LIENS.forEach(function (l) {
          if (l.type !== "conjoint") return;
          [[l.a, l.b], [l.b, l.a]].forEach(function (c) {
            var k = P.clePhon(c[0].nom).slice(0, 3) + "|" + P.clePhon(c[1].nom).slice(0, 3);
            if (!parSon.has(k)) parSon.set(k, []);
            parSon.get(k).push(c);
          });
        });
        parSon.forEach(function (l) {
          for (var i = 0; i < l.length; i++) for (var j = i + 1; j < l.length; j++) {
            var x = l[i], y = l[j];
            if (personneProche(x[0], y[0]) && personneProche(x[1], y[1])) {
              uf.unir(noeud(x[0]), noeud(y[0]));
              uf.unir(noeud(x[1]), noeud(y[1]));
            }
          }
        });
      }
    }
    // Un individu déduit se confond avec l'unique individu réel de même nom… seulement s'il y en a un seul.
    var reelsParCle = new Map();
    M.forEach(function (x) {
      if (!x.cle) return;
      var r = uf.trouver(noeud(x));
      if (!reelsParCle.has(x.cle)) reelsParCle.set(x.cle, new Set());
      reelsParCle.get(x.cle).add(r);
    });
    virtuels.forEach(function (v, cle) {
      var reels = reelsParCle.get(cle);
      if (reels && reels.size === 1) uf.unir(Array.from(reels)[0], "v" + cle);
    });

    // ---- Individus
    var INDIV = new Map();
    function individu(id) {
      var r = uf.trouver(id);
      var ind = INDIV.get(r);
      if (!ind) {
        ind = { id: r, mentions: [], noms: new Map(), prenoms: new Map(), parents: new Map(), enfants: new Map(),
          conjoints: new Map(), fratrie: new Map(), feuAvant: null, deduit: true, professions: new Map(), residences: new Map() };
        INDIV.set(r, ind);
      }
      return ind;
    }
    function compter(map, v) { if (v) map.set(v, (map.get(v) || 0) + 1); }
    M.forEach(function (x) {
      if (!x.cle) return;
      var ind = individu(noeud(x));
      ind.deduit = false;
      ind.mentions.push(x);
      compter(ind.noms, x.nom.toUpperCase());
      compter(ind.prenoms, x.prenom);
      compter(ind.professions, nettoyer(x.m.p.profession).split(/[;,(]/)[0].trim().toLowerCase());
      compter(ind.residences, nettoyer(x.m.p.residence).replace(/\(.*?\)/g, "").split(/[;]/)[0].trim());
      if (x.notaire) ind.notaire = true;
    });
    virtuels.forEach(function (v, cle) {
      var ind = individu("v" + cle);
      if (ind.deduit) { compter(ind.noms, v.nom); compter(ind.prenoms, v.prenom); }
      ind.cleNom = cle.split("|")[0];
    });
    function noter(map, ind, lien) {
      if (ind === undefined) return;
      var e = map.get(ind.id);
      if (!e) map.set(ind.id, e = { ind: ind, actes: [] });
      if (e.actes.indexOf(lien.acte) < 0) e.actes.push(lien.acte);
    }
    LIENS.forEach(function (l) {
      var a = individu(noeud(l.a)), b = individu(noeud(l.b));
      if (a === b) return;
      var an = anneeDe(l.acte);
      if (l.type === "parent") { noter(a.enfants, b, l); noter(b.parents, a, l); }
      else if (l.type === "conjoint") { noter(a.conjoints, b, l); noter(b.conjoints, a, l); }
      else if (l.type === "fratrie") { noter(a.fratrie, b, l); noter(b.fratrie, a, l); }
      if (l.feuA && an && (!a.feuAvant || an < a.feuAvant)) a.feuAvant = an;
      if (l.feuB && an && (!b.feuAvant || an < b.feuAvant)) b.feuAvant = an;
    });
    // Liens contradictoires (A parent et enfant de B, ou conjoint et enfant) : homonymes confondus
    // ou erreur de lecture ; on les écarte en le signalant.
    INDIV.forEach(function (ind) {
      ind.enfants.forEach(function (e, id) {
        if (ind.conjoints.has(id)) {
          ind.enfants.delete(id); ind.conjoints.delete(id);
          e.ind.parents.delete(ind.id); e.ind.conjoints.delete(ind.id);
          ind.contradiction = e.ind.contradiction = true;
        }
      });
      ind.parents.forEach(function (e, id) {
        if (ind.enfants.has(id)) {
          ind.parents.delete(id); ind.enfants.delete(id);
          e.ind.parents.delete(ind.id); e.ind.enfants.delete(ind.id);
          ind.contradiction = e.ind.contradiction = true;
        }
      });
    });
    // Deux parents d'un même enfant forment un couple (même si aucun acte ne le dit).
    INDIV.forEach(function (ind) {
      if (ind.parents.size !== 2) return;
      var ps = Array.from(ind.parents.values());
      var x = ps[0].ind, y = ps[1].ind;
      if (!x.conjoints.has(y.id) && !x.enfants.has(y.id) && !y.enfants.has(x.id)) {
        var actes = ps[0].actes.filter(function (a) { return ps[1].actes.indexOf(a) >= 0; });
        x.conjoints.set(y.id, { ind: y, actes: actes, deduit: true });
        y.conjoints.set(x.id, { ind: x, actes: actes, deduit: true });
      }
    });
    // Libellés
    INDIV.forEach(function (ind) {
      ind.nom = plusFrequent(ind.noms) || "";
      ind.prenom = plusFrequent(ind.prenoms) || "";
      ind.cleNomFamille = P.clePhon(ind.nom);
      var ans = ind.mentions.map(function (x) { return anneeDe(x.acte); }).filter(Boolean).sort();
      ind.debut = ans[0] || null;
      ind.fin = ans[ans.length - 1] || null;
      ind.profession = plusFrequent(ind.professions);
      ind.residence = plusFrequent(ind.residences);
      ind.cle = cleNom(ind.nom) + "|" + clePrenom(ind.prenom);
    });
    // Sexe probable (pour l'affichage) : d'après les rôles et filiations (« fille de », « veuve de »,
    // « vendeur »…), puis d'après les prénoms usuels, puis par opposition au conjoint.
    var FEM = /^(?:fille|épouse|future épouse|veuve|femme|mère|sœur|soeur|venderesse|vendeuse|testatrice|donatrice|acquéreuse|héritière|débitrice|créancière|cédante|preneuse|tante|nièce|cousine|belle-mère|belle-sœur|servante|damoiselle|demoiselle|dame)\b/i;
    var MASC = /^(?:fils|filz|époux|futur époux|mari|père|frère|vendeur|testateur|donateur|acquéreur|héritier|débiteur|créancier|cédant|preneur|oncle|neveu|cousin|beau-père|beau-frère|gendre|prêtre|curé|notaire|sieur|marchand|laboureur|praticien|clerc)\b/i;
    // Formes écrites (sans accents) : la clé orthographique confondrait Jean et Jeanne.
    var cles = function (liste) { var r = new Set(); liste.split(" ").forEach(function (n) { r.add(P.lettres(n)); }); return r; };
    var PRENOMS_F = cles("Marguerite Catherine Jeanne Antoinette Marie Anne Isabeau Isabelle Agnès Françoise Louise Gabrielle Hélips Helix " +
      "Jehanne Delphine Madeleine Raymonde Jacquette Maronne Peyronnelle Astruge Blanche Guillemette Sibylle Claudine Lucrèce Perrette Susanne " +
      "Toinette Barthélemie Alix Hélène Michelle Philippine Gasparde Jacqueline Dauphine Flourette Bonne Vidale Durande Pétronille");
    var PRENOMS_M = cles("Jean Pierre Antoine Guillaume Jacques Étienne François Durand Vidal Mathieu Géraud Barthélemy Bernard Michel " +
      "Louis Charles Hugues Gaspard Balthazar Georges Bertrand Gilbert Blaise André Grégoire Philippe Raymond Astorg Adrien Laurent " +
      "Simon Nicolas Sébastien Germain Robert Gabriel Philibert Aymard Bonnet Guillen Guilhen Dominique Vital Hector Armand Julien " +
      "Martin Thomas Joseph Paul Amable Benoît Christophe Martial Marc Mathias Abraham Jérôme Gilles Denis Léonard Annet Antonin");
    INDIV.forEach(function (ind) {
      var f = 0, m = 0;
      ind.mentions.forEach(function (x) {
        [x.m.p.role, x.m.p.filiation].forEach(function (t) {
          t = nettoyer(t).replace(/^(?:probablement|sans doute|second|seconde|première|premier|aîné|aînée|feue?)\s+/i, "");
          if (FEM.test(t)) f++; else if (MASC.test(t)) m++;
        });
      });
      if (f > m) ind.sexe = "F";
      else if (m > f) ind.sexe = "M";
      else {
        // Prénom usuel (forme écrite : Jeanne ≠ Jean).
        var pr = P.lettres(ind.prenom.split(" ")[0]).replace(/^IEH?AN/, "JEAN").replace(/^ANTH/, "ANT");
        if (PRENOMS_F.has(pr)) ind.sexe = "F";
        else if (PRENOMS_M.has(pr)) ind.sexe = "M";
      }
    });
    for (var tour = 0; tour < 2; tour++) INDIV.forEach(function (ind) {
      if (ind.sexe) return;
      ind.conjoints.forEach(function (e) { if (e.ind.sexe && !ind.sexe) ind.sexe = e.ind.sexe === "F" ? "M" : "F"; });
    });
    // Rang dans la fratrie quand un acte le précise (« fille aînée », « fils cadet »…).
    INDIV.forEach(function (ind) {
      ind.mentions.forEach(function (x) {
        var m = /(?:^|[^a-zà-ÿ])(aînée|aîné|aisnée|aisné|cadette|cadet|puînée|puîné)(?![a-zà-ÿ])/i.exec(x.m.p.role + " " + x.m.p.filiation.split(/[;,]/)[0]);
        if (m && !ind.rang) ind.rang = m[1].toLowerCase().replace("aisn", "aîn");
      });
    });
    // Variantes d'écriture réunies dans un même individu (affichées pour contrôle).
    INDIV.forEach(function (ind) {
      var v = new Set();
      ind.mentions.forEach(function (x) { v.add(x.prenom + " " + x.nom.toUpperCase()); });
      v.delete(ind.prenom + " " + ind.nom);
      ind.variantes = Array.from(v);
    });
    // Homonymes : plusieurs individus de même nom et prénom.
    var parCle = new Map();
    INDIV.forEach(function (ind) {
      if (!parCle.has(ind.cle)) parCle.set(ind.cle, []);
      parCle.get(ind.cle).push(ind);
    });
    parCle.forEach(function (l) { if (l.length > 1) l.forEach(function (ind) { ind.homonymes = l.length; }); });

    return { individus: INDIV, liens: LIENS };
  }

  function plusFrequent(map) {
    var best = null, n = -1;
    map.forEach(function (v, k) { if (v > n) { n = v; best = k; } });
    return best;
  }

  // ------------------------------------------------------------------ famille d'un patronyme
  // Individus du nom (proximité phonétique) + leurs conjoints, parents et enfants d'autres noms.
  function famille(base, patronyme) {
    var k = P.clePhon(patronyme);
    var membres = new Map();
    base.individus.forEach(function (ind) {
      if (ind.notaire && !ind.parents.size && !ind.enfants.size && !ind.conjoints.size) return;
      if (ind.cleNomFamille === k) membres.set(ind.id, ind);
    });
    var allies = new Map();
    membres.forEach(function (ind) {
      [ind.conjoints, ind.parents, ind.enfants].forEach(function (m) {
        m.forEach(function (e) { if (!membres.has(e.ind.id)) allies.set(e.ind.id, e.ind); });
      });
    });
    return { membres: membres, allies: allies };
  }

  var api = { construire: construire, famille: famille, extraireRelations: extraireRelations };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.FamillesMoteur = api;
})(this);
