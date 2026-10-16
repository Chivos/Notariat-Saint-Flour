/* Panneau « Statistiques » : chiffres et graphiques sur les actes indexés.
 * Calculé à la première ouverture à partir des données chargées par app.js
 * (window.Explorateur). Un clic sur une barre lance la recherche correspondante. */
(function () {
  "use strict";

  var P = window.Phonetique;
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
    "septembre", "octobre", "novembre", "décembre"];
  var MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function nombre(n) { return n.toLocaleString("fr"); }
  function dateLisible(d) {
    var p = d.split("-"), m = parseInt(p[1], 10), j = parseInt(p[2], 10);
    return (j ? j + " " : "") + (m ? MOIS[m - 1] + " " : "") + p[0];
  }
  // Retire les marques critiques ([?], crochets) d'une forme affichée.
  function propre(s) {
    return String(s || "").replace(/\[\s*\?\s*\]|\?/g, "").replace(/[\[\]]/g, "").replace(/\s+/g, " ").trim();
  }
  // Première partie d'un rôle ou d'une profession (« témoin ; parent » -> « témoin »).
  function tete(s) {
    return propre(String(s || "").split(/[;,(—–:]/)[0]).toLowerCase();
  }

  // Compteur : clé -> { n, formes: {forme: nb}, actes: Set }.
  function Compteur() { this.m = new Map(); }
  Compteur.prototype.ajouter = function (cle, forme, acte) {
    if (!cle) return;
    var e = this.m.get(cle);
    if (!e) { e = { cle: cle, n: 0, formes: new Map(), actes: new Set() }; this.m.set(cle, e); }
    e.n++;
    if (acte !== undefined) e.actes.add(acte);
    if (forme) e.formes.set(forme, (e.formes.get(forme) || 0) + 1);
  };
  // Les entrées les plus fréquentes, avec leur forme la plus courante.
  Compteur.prototype.top = function (k, parActes) {
    return Array.from(this.m.values()).map(function (e) {
      var forme = e.cle, max = -1;
      e.formes.forEach(function (n, f) { if (n > max) { max = n; forme = f; } });
      return { cle: e.cle, label: forme, n: parActes ? e.actes.size : e.n };
    }).sort(function (a, b) { return b.n - a.n || a.label.localeCompare(b.label, "fr"); }).slice(0, k);
  };

  function calculer(actes, mentions) {
    var s = {
      nbActes: actes.length, nbMentions: mentions.length,
      annees: new Map(), mois: new Array(12).fill(0),
      types: new Compteur(), notaires: new Compteur(), etats: new Compteur(), confiances: new Compteur(),
      noms: new Compteur(), prenoms: new Compteur(), roles: new Compteur(), professions: new Compteur(),
      lieux: new Compteur(),
      dateMin: null, dateMax: null, sansDate: 0, datesIncompletes: 0, maxPersonnes: null,
    };
    var patronymes = new Set();
    actes.forEach(function (a) {
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(a.date || "");
      if (!m || m[1] === "0000") s.sansDate++;
      else {
        if (m[2] === "00" || m[3] === "00") s.datesIncompletes++;
        var y = parseInt(m[1], 10);
        s.annees.set(y, (s.annees.get(y) || 0) + 1);
        if (m[2] !== "00") s.mois[parseInt(m[2], 10) - 1]++;
        // Bornes de la période : la date la plus précise possible à chaque extrémité.
        if (!s.dateMin || a.date.replace(/-00/g, "-99") < s.dateMin.replace(/-00/g, "-99")) s.dateMin = a.date;
        if (!s.dateMax || a.date > s.dateMax) s.dateMax = a.date;
      }
      s.types.ajouter(a.tg, a.tg);
      s.notaires.ajouter(a.ng, a.ng);
      s.etats.ajouter(a.etat || "non précisé", a.etat || "non précisé");
      s.confiances.ajouter(a.confiance || "non précisée", a.confiance || "non précisée");
      if (!s.maxPersonnes || a.personnes.length > s.maxPersonnes.personnes.length) s.maxPersonnes = a;
      var vus = new Set();
      a.lieux.forEach(function (l) {
        var f = propre(l.replace(/\(.*?\)/g, "")).replace(/[ ,;.]+$/, "");
        var k = P.cleOrtho(f);
        if (k && !vus.has(k)) { vus.add(k); s.lieux.ajouter(k, f, a.idx); }
      });
    });
    mentions.forEach(function (m) {
      var p = m.p;
      var notaire = /notaire/i.test(p.role); // le notaire figure dans presque tous les actes
      var nom = propre(p.nom);
      var kn = P.cleOrtho(nom);
      if (kn) patronymes.add(kn);
      if (kn && !notaire && nom.length > 1) s.noms.ajouter(kn, nom, m.acte.idx);
      var prenom = propre(p.prenom).split(" ")[0];
      if (prenom && !notaire && prenom.replace(/\./g, "").length > 1) s.prenoms.ajouter(P.prenomCanonique(prenom), prenom);
      s.roles.ajouter(tete(p.role), tete(p.role));
      var pro = tete(p.profession);
      if (pro && pro !== "—") s.professions.ajouter(pro, pro);
    });
    s.nbPatronymes = patronymes.size;
    return s;
  }

  // ------------------------------------------------------------------ rendu
  function tuile(label, valeur, detail) {
    return '<div class="tuile"><div class="tuile-label">' + esc(label) + '</div><div class="tuile-valeur">' + valeur +
      "</div>" + (detail ? '<div class="tuile-detail">' + detail + "</div>" : "") + "</div>";
  }

  // Barres horizontales, valeur au bout. `action(e)` -> critères de recherche (ou null).
  function barres(titre, sousTitre, lignes, unite, action) {
    var max = lignes.reduce(function (m, l) { return Math.max(m, l.n); }, 1);
    return '<section class="graphique"><h3>' + esc(titre) + "</h3>" + (sousTitre ? '<p class="sous-titre-graphique">' + sousTitre + "</p>" : "") +
      '<ol class="barres">' + lignes.map(function (l) {
        var crit = action ? action(l) : null;
        var attrs = crit ? ' role="button" tabindex="0" data-recherche="' + esc(JSON.stringify(crit)) + '"' : "";
        return "<li" + (crit ? ' class="actionnable"' : "") + attrs + ' data-tip="' + esc(l.label + " : " + nombre(l.n) + " " + unite) + '">' +
          '<span class="barre-label">' + esc(l.label) + "</span>" +
          '<span class="barre-piste"><span class="barre" style="width:calc((100% - 3.8rem) * ' + (l.n / max).toFixed(4) + ')"></span>' +
          '<span class="barre-valeur">' + nombre(l.n) + "</span></span></li>";
      }).join("") + "</ol></section>";
  }

  // Graduations « rondes » pour un axe allant de 0 à max.
  function graduations(max) {
    var pas = Math.pow(10, Math.floor(Math.log10(Math.max(1, max / 4))));
    var choix = [1, 2, 5, 10].map(function (k) { return k * pas; }).filter(function (p) { return max / p <= 5; })[0] || pas * 10;
    var g = [];
    for (var v = 0; v <= max; v += choix) g.push(v);
    return { valeurs: g, haut: Math.max(max, g[g.length - 1]) };
  }

  // Colonnes verticales (années, mois) avec axe gradué et étiquettes choisies.
  function colonnes(titre, sousTitre, points, unite, etiquette, action) {
    var max = points.reduce(function (m, p) { return Math.max(m, p.n); }, 1);
    var g = graduations(max);
    return '<section class="graphique graphique-large"><h3>' + esc(titre) + "</h3>" + (sousTitre ? '<p class="sous-titre-graphique">' + sousTitre + "</p>" : "") +
      '<div class="colonnes-cadre"><div class="axe-y">' +
      g.valeurs.map(function (v) { return '<span style="bottom:' + (100 * v / g.haut) + '%">' + nombre(v) + "</span>"; }).join("") +
      '</div><div class="colonnes">' +
      g.valeurs.map(function (v) { return '<span class="grille" style="bottom:' + (100 * v / g.haut) + '%"></span>'; }).join("") +
      points.map(function (p, i) {
        var crit = action && p.n ? action(p) : null;
        return '<div class="colonne' + (crit ? " actionnable" : "") + '"' +
          (crit ? ' role="button" tabindex="0" data-recherche="' + esc(JSON.stringify(crit)) + '"' : "") +
          ' data-tip="' + esc(p.label + " : " + nombre(p.n) + " " + unite) + '">' +
          '<span class="col" style="height:' + (100 * p.n / g.haut).toFixed(1) + '%' + (p.n ? ";min-height:2px" : "") + '"></span>' +
          '<span class="col-label">' + esc(etiquette(p, i)) + "</span></div>";
      }).join("") +
      "</div></div>" +
      '<details class="tableau-chiffres"><summary>Voir les chiffres</summary><table><tbody>' +
      points.map(function (p) { return "<tr><td>" + esc(p.label) + "</td><td>" + nombre(p.n) + "</td></tr>"; }).join("") +
      "</tbody></table></details></section>";
  }

  function rendre(s) {
    var datees = s.nbActes - s.sansDate;
    var annees = Array.from(s.annees.keys()).sort(function (a, b) { return a - b; });
    var points = [];
    if (annees.length) for (var y = annees[0]; y <= annees[annees.length - 1]; y++) points.push({ label: String(y), n: s.annees.get(y) || 0, annee: y });
    var anneeMax = points.reduce(function (m, p) { return p.n > m.n ? p : m; }, { n: -1 });
    var nbMois = s.mois.reduce(function (a, b) { return a + b; }, 0);
    var mp = s.maxPersonnes;
    var pas = points.length > 30 ? 10 : 5;

    return '<div class="tuiles">' +
      tuile("Période couverte", annees.length ? annees[0] + " – " + annees[annees.length - 1] : "—",
        annees.length ? "du " + esc(dateLisible(s.dateMin)) + "<br>au " + esc(dateLisible(s.dateMax)) : "") +
      tuile("Actes indexés", nombre(s.nbActes),
        s.sansDate ? nombre(s.sansDate) + " sans date, " + nombre(s.datesIncompletes) + " à date incomplète" : nombre(s.datesIncompletes) + " à date incomplète") +
      tuile("Mentions de personnes", nombre(s.nbMentions),
        (s.nbMentions / Math.max(1, s.nbActes)).toLocaleString("fr", { maximumFractionDigits: 1 }) + " par acte en moyenne") +
      tuile("Patronymes distincts", nombre(s.nbPatronymes), "après normalisation orthographique") +
      "</div>" +
      '<section class="graphique graphique-large" id="stats-registres"><h3>Registres couverts</h3>' +
      '<p class="sous-titre-graphique">Chargement de la liste des registres…</p></section>' +

      colonnes("Actes par année", "Actes datés : " + nombre(datees) + ". Année la plus fournie : " + esc(anneeMax.label) + " (" + nombre(anneeMax.n) + " actes). Cliquez sur une année pour en voir les actes.",
        points, "actes", function (p) { return p.annee % pas === 0 || p === points[0] || p === points[points.length - 1] ? p.label : ""; },
        function (p) { return { criteres: { du: p.label, au: p.label }, vue: "actes" }; }) +

      '<div class="grille-graphiques">' +
      barres("Actes par type", "", s.types.top(30), "actes", function (l) { return { criteres: { type: l.cle }, vue: "actes" }; }) +
      '<div class="pile">' +
      barres("Actes par notaire", "", s.notaires.top(10), "actes", function (l) {
        return l.cle === "non identifié" ? null : { criteres: { notaire: l.cle }, vue: "actes" };
      }) +
      colonnes("Saisonnalité", "Actes par mois de passation, toutes années confondues (" + nombre(nbMois) + " actes au mois connu).",
        s.mois.map(function (n, i) { return { label: MOIS[i], n: n }; }), "actes", function (p, i) { return MOIS_COURTS[i].charAt(0).toUpperCase(); }, null) +
      "</div>" +
      barres("Noms de famille les plus fréquents", "Nombre d'actes où le nom apparaît (notaires exclus ; variantes orthographiques regroupées).",
        s.noms.top(25, true), "actes", function (l) { return { criteres: { nom1: l.label, modeNom: "ortho" }, vue: "actes" }; }) +
      barres("Prénoms les plus fréquents", "Nombre de mentions (notaires exclus ; Jehan = Jean, Anthoine = Antoine…).",
        s.prenoms.top(25), "mentions", function (l) { return { criteres: { prenom1: l.label }, vue: "personnes" }; }) +
      barres("Lieux les plus cités", "Nombre d'actes citant le lieu.",
        s.lieux.top(20, true), "actes", function (l) { return { criteres: { texte: l.label }, vue: "actes" }; }) +
      barres("Rôles dans les actes", "Nombre de mentions.",
        s.roles.top(20), "mentions", function (l) { return { criteres: { role1: l.label }, vue: "personnes" }; }) +
      barres("Professions et qualités", "Nombre de mentions où une profession est indiquée.",
        s.professions.top(20), "mentions", function (l) { return { criteres: { profession1: l.label }, vue: "personnes" }; }) +
      '<div class="pile">' +
      barres("État de la transcription", "", s.etats.top(10), "actes", null) +
      barres("Confiance de la lecture", "", s.confiances.top(10), "actes", null) +
      (mp ? '<section class="graphique"><h3>Acte le plus peuplé</h3><p>' +
        '<button type="button" class="lien-acte" data-acte="' + mp.idx + '">' + esc(dateLisible(mp.date)) + " — " + esc(mp.type) + "</button> : " +
        nombre(mp.personnes.length) + " personnes citées.</p></section>" : "") +
      "</div>" +
      "</div>";
  }

  // ------------------------------------------------------------------ registres
  // Liste des registres d'après les noms des dossiers de scans (registres.json, produit
  // à la publication par outils/registres.py). À défaut (page ouverte hors du site
  // publié), on la reconstitue à partir des cotes de l'index.
  var NOMS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  function cleTri(cote) {
    return cote.split(/(\d+)/).map(function (p) { return /^\d+$/.test(p) ? ("000000" + p).slice(-6) : p; }).join("");
  }
  function chargerRegistres(actes) {
    var section = document.getElementById("stats-registres");
    var dansIndex = new Map(), notaires = new Map(), annees = new Map();
    actes.forEach(function (a) {
      if (!a.registre) return;
      dansIndex.set(a.registre, (dansIndex.get(a.registre) || 0) + 1);
      var n = notaires.get(a.registre) || new Map();
      var nom = String(a.notaire || "").replace(/\[.*?\]|\(.*?\)|\?/g, "").replace(/\s+/g, " ").trim();
      if (nom) n.set(nom, (n.get(nom) || 0) + 1);
      notaires.set(a.registre, n);
      var y = parseInt((a.date || "").slice(0, 4), 10);
      if (y > 0) { var b = annees.get(a.registre) || [y, y]; annees.set(a.registre, [Math.min(b[0], y), Math.max(b[1], y)]); }
    });
    function nomComplet(r) {
      // Nom du dossier (« Sourzat »), complété du prénom le plus fréquent dans l'index.
      var meilleur = "", max = 0;
      (notaires.get(r.cote) || new Map()).forEach(function (n, nom) { if (n > max) { max = n; meilleur = nom; } });
      var court = r.notaire.toUpperCase();
      var plat = function (s) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase(); };
      return meilleur && plat(meilleur).indexOf(plat(court)) === 0 ? meilleur : court;
    }
    function periode(r) {
      if (r.annee_debut == null) return esc(r.periode || "");
      var a = r.annee_fin && r.annee_fin !== r.annee_debut ? r.annee_debut + "–" + r.annee_fin : String(r.annee_debut);
      return r.mois_debut ? a + ' <span class="dossier-mois">(à partir de ' + NOMS_MOIS[r.mois_debut - 1] + ")</span>" : a;
    }
    function afficher(liste, depuisDossiers) {
      var total = liste.reduce(function (s, r) { return s + (r.fiches || 0); }, 0);
      section.innerHTML = "<h3>Registres couverts</h3>" +
        '<p class="sous-titre-graphique">' + nombre(liste.length) + " registres, classés par cote des Archives départementales du Cantal. " +
        (depuisDossiers
          ? "Notaire et années d'après le nom du dossier de numérisation (pas d'après la lecture des actes). "
          : "Liste reconstituée d'après les cotes de l'index (la liste établie d'après les dossiers de numérisation n'est disponible que sur le site publié). ") +
        "Cliquez sur un registre pour en afficher les actes.</p>" +
        '<div class="defile"><table class="table-registres"><thead><tr><th>Cote</th><th>Notaire</th><th>Années</th>' +
        (depuisDossiers ? '<th class="nombre">Actes transcrits</th>' : "") + '<th class="nombre">Dans l\'index</th></tr></thead><tbody>' +
        liste.map(function (r) {
          var n = dansIndex.get(r.cote) || 0;
          var ecart = depuisDossiers && n < r.fiches;
          // Un registre absent de l'index n'a pas d'actes à afficher : ligne non cliquable.
          var attrs = n ? ' class="ligne-registre" role="button" tabindex="0" data-recherche="' + esc(JSON.stringify({ criteres: { registre: r.cote }, vue: "actes" })) + '"'
            : ' title="Registre transcrit mais pas encore intégré à l\'index"';
          return "<tr" + attrs + ">" +
            '<td class="cote">' + esc(r.cote) + (r.dossier ? '<span class="dossier">' + esc(r.dossier) + "</span>" : "") + "</td>" +
            "<td>" + esc(nomComplet(r)) + "</td><td>" + periode(r) + "</td>" +
            (depuisDossiers ? '<td class="nombre">' + nombre(r.fiches) + "</td>" : "") +
            '<td class="nombre' + (ecart ? " ecart-index" : "") + '"' + (ecart ? ' title="Des fiches de ce registre ne sont pas encore dans l\'index"' : "") + ">" + nombre(n) + "</td></tr>";
        }).join("") +
        (depuisDossiers ? '<tr class="total"><td colspan="3">Total</td><td class="nombre">' + nombre(total) + '</td><td class="nombre">' +
          nombre(Array.from(dansIndex.values()).reduce(function (s, n) { return s + n; }, 0)) + "</td></tr>" : "") +
        "</tbody></table></div>";
    }
    function deLIndex() {
      var liste = Array.from(dansIndex.keys()).map(function (cote) {
        var b = annees.get(cote) || [null, null];
        var nom = "", max = 0;
        (notaires.get(cote) || new Map()).forEach(function (n, k) { if (n > max) { max = n; nom = k; } });
        return { cote: cote, notaire: nom.split(" ")[0] || "", annee_debut: b[0], annee_fin: b[1] };
      }).sort(function (a, b) { return cleTri(a.cote).localeCompare(cleTri(b.cote)); });
      afficher(liste, false);
    }
    if (!/^https?:$/.test(location.protocol)) { deLIndex(); return; }
    fetch("registres.json", { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (d) { afficher(d.registres || [], true); }).catch(deLIndex);
  }

  // ------------------------------------------------------------------ dialogue
  var dialogue = document.getElementById("statistiques");
  var corps = document.getElementById("statistiques-corps");
  var bulle = document.getElementById("infobulle-stats");

  function ouvrir() {
    var X = window.Explorateur;
    if (!X) return; // index pas encore chargé
    if (!corps.dataset.pret) {
      corps.innerHTML = rendre(calculer(X.actes, X.mentions));
      corps.dataset.pret = "1";
      chargerRegistres(X.actes);
    }
    dialogue.showModal();
  }
  document.getElementById("bouton-stats").addEventListener("click", ouvrir);

  function lancer(el) {
    var r = JSON.parse(el.dataset.recherche);
    dialogue.close();
    window.Explorateur.chercher(r.criteres, r.vue);
  }
  corps.addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-recherche]");
    if (el) lancer(el);
  });
  corps.addEventListener("keydown", function (ev) {
    var el = ev.target.closest("[data-recherche]");
    if (el && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); lancer(el); }
  });

  // Infobulle au survol (dans le dialogue, pour rester au premier plan).
  corps.addEventListener("mousemove", function (ev) {
    var el = ev.target.closest("[data-tip]");
    if (!el) { bulle.hidden = true; return; }
    bulle.textContent = el.dataset.tip;
    bulle.hidden = false;
    var x = ev.clientX + 14, y = ev.clientY + 14;
    var l = bulle.offsetWidth, h = bulle.offsetHeight;
    if (x + l > window.innerWidth - 8) x = ev.clientX - l - 10;
    if (y + h > window.innerHeight - 8) y = ev.clientY - h - 10;
    bulle.style.left = x + "px";
    bulle.style.top = y + "px";
  });
  corps.addEventListener("mouseleave", function () { bulle.hidden = true; });
  dialogue.addEventListener("close", function () { bulle.hidden = true; });
  dialogue.addEventListener("scroll", function () { bulle.hidden = true; }, true);
})();
