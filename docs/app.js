/* Explorateur des index du notariat de Saint-Flour. */
(function () {
  "use strict";

  var P = window.Phonetique;
  var DONNEES = window.INDEX_NOTARIAT;
  var ACTES = DONNEES.actes;
  var PAR_PAGE = 50;

  var $ = function (sel, racine) { return (racine || document).querySelector(sel); };
  var $$ = function (sel, racine) { return Array.prototype.slice.call((racine || document).querySelectorAll(sel)); };

  // ------------------------------------------------------------------ préparation
  // Texte « à plat » pour les comparaisons insensibles à la casse et aux accents.
  function plat(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  // Intervalle couvert par une date éventuellement incomplète (« 1660-00-00 »).
  function bornesDate(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || "");
    if (!m || m[1] === "0000") return null;
    var mois = m[2] === "00" ? ["01", "12"] : [m[2], m[2]];
    var jour = m[3] === "00" ? ["01", "31"] : [m[3], m[3]];
    return [m[1] + "-" + mois[0] + "-" + jour[0], m[1] + "-" + mois[1] + "-" + jour[1]];
  }

  var MENTIONS = []; // une entrée par personne citée dans un acte
  ACTES.forEach(function (a, ia) {
    a.idx = ia;
    a.bornes = bornesDate(a.date);
    a.texte = plat([a.type, a.resume, a.cote, a.lieu, a.notaire].concat(a.lieux, a.sommes, a.mots).join(" \u0001 "));
    a.mentions = [];
    a.personnes.forEach(function (p, ip) {
      var tokens = [];
      p.graphies.forEach(function (g) {
        var ms = P.mots(g).filter(function (m) { return m.length > 1 && !P.MOTS_VIDES[m]; });
        ms.forEach(function (m, i) {
          tokens.push(m);
          if (i + 1 < ms.length) tokens.push(m + ms[i + 1]); // « de Lort », « Del Bos »
        });
      });
      var m = {
        acte: a, p: p, ip: ip,
        motsPrenom: P.mots(p.prenom),
        tokens: tokens,
        role: plat(p.role),
        profession: plat(p.profession),
        residence: plat(p.residence + " \u0001 " + p.filiation),
      };
      a.mentions.push(m);
      MENTIONS.push(m);
    });
  });

  // ------------------------------------------------------------------ correspondance des noms
  var CLES = {
    exact: function (s) { return P.lettres(s); },
    ortho: P.cleOrtho,
    phon: P.clePhon,
  };
  var cachesCles = { exact: new Map(), ortho: new Map(), phon: new Map() };
  function cle(mode, s, prenom) {
    var k = (prenom ? "p:" : "n:") + s;
    var c = cachesCles[mode];
    var v = c.get(k);
    if (v === undefined) {
      var base = s;
      if (prenom) base = P.prenomCanonique(s); // forme de référence (clé ortho)
      v = CLES[mode](base);
      c.set(k, v);
    }
    return v;
  }

  // Construit une fonction (chaîne -> booléen) pour un mot recherché.
  function comparateur(requete, mode, position, tolerance, prenom) {
    var q = cle(mode, requete, prenom);
    if (!q) return null;
    // Sur un nom court, 3 lettres d'écart ne veulent plus rien dire.
    if (tolerance > 0) tolerance = Math.min(tolerance, Math.max(1, Math.floor(q.length / 3)));
    var memo = new Map();
    return function (valeur) {
      var r = memo.get(valeur);
      if (r !== undefined) return r;
      var v = cle(mode, valeur, prenom);
      if (!v) r = false;
      else if (position === "contient") r = v.indexOf(q) >= 0 || (tolerance > 0 && contientApproche(v, q, tolerance));
      else if (position === "debut") r = v.lastIndexOf(q, 0) === 0 || (tolerance > 0 && P.distance(v.slice(0, q.length), q, tolerance) <= tolerance);
      else r = v === q || (tolerance > 0 && P.distance(v, q, tolerance) <= tolerance);
      memo.set(valeur, r);
      return r;
    };
  }

  function contientApproche(v, q, t) {
    for (var i = 0; i + q.length - t <= v.length; i++) {
      for (var l = Math.max(1, q.length - t); l <= q.length + t && i + l <= v.length; l++) {
        if (P.distance(v.substr(i, l), q, t) <= t) return true;
      }
    }
    return false;
  }

  // Filtre « personne » : renvoie une fonction (mention -> booléen) ou null si vide.
  function filtrePersonne(c, opts) {
    var tests = [];
    var nomQ = c.nom.trim();
    if (nomQ) {
      // Un nom en plusieurs mots (« de Lort ») est comparé d'un seul tenant.
      var cmpNom = comparateur(nomQ, opts.modeNom, opts.position, opts.tolerance, false);
      if (cmpNom) tests.push(function (m) {
        if (cmpNom(m.p.nom)) return true;
        if (opts.graphies) for (var i = 0; i < m.tokens.length; i++) if (cmpNom(m.tokens[i])) return true;
        return false;
      });
    }
    var motsP = P.mots(c.prenom);
    if (motsP.length) {
      var cmps = motsP.map(function (w) {
        return comparateur(w, opts.modePrenom, opts.position, opts.tolerance, opts.equivPrenoms);
      }).filter(Boolean);
      if (cmps.length) tests.push(function (m) {
        return cmps.every(function (cmp) {
          for (var i = 0; i < m.motsPrenom.length; i++) if (cmp(m.motsPrenom[i])) return true;
          if (opts.graphies) for (var j = 0; j < m.tokens.length; j++) if (cmp(m.tokens[j])) return true;
          return false;
        });
      });
    }
    [["role", "role"], ["profession", "profession"], ["residence", "residence"]].forEach(function (x) {
      var mots = plat(c[x[0]]).split(/\s+/).filter(Boolean);
      if (mots.length) tests.push(function (m) {
        return mots.every(function (w) { return m[x[1]].indexOf(w) >= 0; });
      });
    });
    if (!tests.length) return null;
    return function (m) {
      for (var i = 0; i < tests.length; i++) if (!tests[i](m)) return false;
      return true;
    };
  }

  // ------------------------------------------------------------------ formulaire
  var form = $("#formulaire");
  var CHAMPS_TEXTE = ["nom1", "prenom1", "role1", "profession1", "residence1",
    "nom2", "prenom2", "role2", "profession2", "residence2", "du", "au", "texte"];
  var CHAMPS_SELECT = ["modeNom", "modePrenom", "position", "tolerance", "type", "lieu", "notaire", "etat"];
  var CASES = ["equivPrenoms", "graphies"];
  var DEFAUTS = {};

  function remplirSelect(nom, valeurs) {
    var sel = form.elements[nom];
    valeurs.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v[0];
      o.textContent = v[0] + " (" + v[1] + ")";
      sel.appendChild(o);
    });
  }
  function compter(cle) {
    var n = new Map();
    ACTES.forEach(function (a) { n.set(a[cle], (n.get(a[cle]) || 0) + 1); });
    return Array.from(n.entries());
  }
  var parNombre = function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0], "fr"); };
  remplirSelect("type", compter("tg").sort(parNombre));
  remplirSelect("lieu", compter("lg").sort(function (a, b) { return a[0].localeCompare(b[0], "fr"); }));
  remplirSelect("notaire", compter("ng").sort(parNombre));
  remplirSelect("etat", compter("etat").sort(parNombre));

  CHAMPS_TEXTE.concat(CHAMPS_SELECT).forEach(function (n) { DEFAUTS[n] = form.elements[n].value; });
  CASES.forEach(function (n) { DEFAUTS[n] = form.elements[n].checked; });

  function lireFormulaire() {
    var e = {};
    CHAMPS_TEXTE.concat(CHAMPS_SELECT).forEach(function (n) { e[n] = form.elements[n].value; });
    CASES.forEach(function (n) { e[n] = form.elements[n].checked; });
    return e;
  }
  function ecrireFormulaire(e) {
    CHAMPS_TEXTE.concat(CHAMPS_SELECT).forEach(function (n) {
      form.elements[n].value = e[n] !== undefined ? e[n] : DEFAUTS[n];
      if (form.elements[n].tagName === "SELECT" && form.elements[n].selectedIndex < 0) form.elements[n].value = DEFAUTS[n];
    });
    CASES.forEach(function (n) { form.elements[n].checked = e[n] !== undefined ? e[n] : DEFAUTS[n]; });
    var p2 = ["nom2", "prenom2", "role2", "profession2", "residence2"].some(function (n) { return form.elements[n].value; });
    afficherPersonne2(p2);
  }

  // ------------------------------------------------------------------ état d'affichage
  var etat = { vue: "personnes", page: 1, tri: "date", personnes: [], actes: [], marques: new Set() };

  // Bornes d'une date saisie (« 1650 », « 1650-3 », « 1650-03-12 »).
  function bornesSaisie(s, fin) {
    var m = /^\s*(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?\s*$/.exec(s || "");
    if (!m) return null;
    var mois = m[2] ? ("0" + m[2]).slice(-2) : (fin ? "12" : "01");
    var jour = m[3] ? ("0" + m[3]).slice(-2) : (fin ? "31" : "01");
    return m[1] + "-" + mois + "-" + jour;
  }

  function rechercher() {
    var e = lireFormulaire();
    var opts = {
      modeNom: e.modeNom, modePrenom: e.modePrenom, position: e.position,
      tolerance: parseInt(e.tolerance, 10) || 0,
      equivPrenoms: e.equivPrenoms, graphies: e.graphies,
    };
    var f1 = filtrePersonne({ nom: e.nom1, prenom: e.prenom1, role: e.role1, profession: e.profession1, residence: e.residence1 }, opts);
    var f2 = !$("#bloc-personne-2").hidden
      ? filtrePersonne({ nom: e.nom2, prenom: e.prenom2, role: e.role2, profession: e.profession2, residence: e.residence2 }, opts)
      : null;

    var du = bornesSaisie(e.du, false), au = bornesSaisie(e.au, true);
    form.elements.du.classList.toggle("invalide", !!e.du.trim() && !du);
    form.elements.au.classList.toggle("invalide", !!e.au.trim() && !au);
    var motsTexte = plat(e.texte).split(/\s+/).filter(Boolean);

    var actes = [], personnes = [], marques = new Set();
    ACTES.forEach(function (a) {
      if (e.type && a.tg !== e.type) return;
      if (e.lieu && a.lg !== e.lieu) return;
      if (e.notaire && a.ng !== e.notaire) return;
      if (e.etat && a.etat !== e.etat) return;
      if (du || au) {
        if (!a.bornes) return;
        if (du && a.bornes[1] < du) return;
        if (au && a.bornes[0] > au) return;
      }
      for (var i = 0; i < motsTexte.length; i++) if (a.texte.indexOf(motsTexte[i]) < 0) return;

      var m1 = f1 ? a.mentions.filter(f1) : null;
      if (m1 && !m1.length) return;
      var m2 = null;
      if (f2) {
        m2 = a.mentions.filter(f2);
        // Il faut deux personnes distinctes.
        var ok = m2.some(function (y) { return !m1 || m1.some(function (x) { return x !== y; }); });
        if (!ok) return;
      }
      actes.push(a);
      var retenues = m1 || m2 ? [].concat(m1 || [], m2 || []) : a.mentions;
      retenues.forEach(function (m) {
        if (!marques.has(m)) { marques.add(m); personnes.push(m); }
      });
    });
    if (!f1 && !f2) marques.clear();

    etat.actes = actes;
    etat.personnes = personnes;
    etat.marques = marques;
    etat.page = 1;
    trier();
    afficher();
    sauverDansAdresse(e);
  }

  function cleTriDate(a) { return a.date || "9999"; }
  function trier() {
    var t = etat.tri;
    var cmpDate = function (a, b) { return cleTriDate(a).localeCompare(cleTriDate(b)) || a.id.localeCompare(b.id); };
    var cmpActe = {
      "date": cmpDate,
      "date-desc": function (a, b) { return -cmpDate(a, b); },
      "nom": cmpDate,
      "type": function (a, b) { return a.tg.localeCompare(b.tg, "fr") || cmpDate(a, b); },
    }[t];
    etat.actes.sort(cmpActe);
    etat.personnes.sort(function (x, y) {
      if (t === "nom") {
        return x.p.nom.localeCompare(y.p.nom, "fr") || x.p.prenom.localeCompare(y.p.prenom, "fr") || cmpDate(x.acte, y.acte);
      }
      return cmpActe(x.acte, y.acte) || x.ip - y.ip;
    });
  }

  // ------------------------------------------------------------------ rendu
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function dateLisible(d) {
    if (!d || /^0000/.test(d)) return "date inconnue";
    var p = d.split("-");
    var MOIS = ["", "janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
    var m = parseInt(p[1], 10), j = parseInt(p[2], 10);
    return (j ? j + " " : "") + (m ? MOIS[m] + " " : "") + p[0];
  }
  function nomComplet(p) {
    var n = p.nom || "—";
    return (p.prenom ? esc(p.prenom) + " " : "") + '<span class="patronyme">' + esc(n) + "</span>";
  }

  function afficher() {
    $("#nb-personnes").textContent = etat.personnes.length.toLocaleString("fr");
    $("#nb-actes").textContent = etat.actes.length.toLocaleString("fr");
    $$(".onglets [role=tab]").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.vue === etat.vue)); });

    var liste = etat.vue === "personnes" ? etat.personnes : etat.actes;
    var nbPages = Math.max(1, Math.ceil(liste.length / PAR_PAGE));
    if (etat.page > nbPages) etat.page = nbPages;
    var debut = (etat.page - 1) * PAR_PAGE;
    var tranche = liste.slice(debut, debut + PAR_PAGE);

    $("#resume-recherche").textContent = liste.length
      ? "Résultats " + (debut + 1) + "–" + (debut + tranche.length) + " sur " + liste.length.toLocaleString("fr")
      : "";

    var html;
    if (!liste.length) {
      html = '<p class="vide">Aucun résultat. Essayez la proximité phonétique, une tolérance d\'une lettre, ou élargissez les dates.</p>';
    } else if (etat.vue === "personnes") {
      html = '<table class="table-personnes"><thead><tr><th>Personne</th><th>Rôle, qualité</th><th>Date</th><th>Acte</th></tr></thead><tbody>' +
        tranche.map(function (m) {
          var p = m.p, a = m.acte;
          var details = [p.profession, p.residence && "à " + p.residence, p.filiation].filter(Boolean).map(esc).join(" · ");
          var graphies = p.graphies.length ? '<div class="graphies">« ' + p.graphies.map(esc).join(" », « ") + " »</div>" : "";
          return '<tr><td data-l="Personne">' + nomComplet(p) + graphies + "</td>" +
            '<td data-l="Rôle">' + esc(p.role) + (details ? '<div class="details">' + details + "</div>" : "") + "</td>" +
            '<td data-l="Date" class="date">' + esc(dateLisible(a.date)) + "</td>" +
            '<td data-l="Acte"><button type="button" class="lien-acte" data-acte="' + a.idx + '">' + esc(a.type) + "</button>" +
            '<div class="details">' + esc(a.lieu || "") + "</div></td></tr>";
        }).join("") + "</tbody></table>";
    } else {
      html = tranche.map(function (a) {
        var personnes = a.personnes.map(function (p, ip) {
          var trouve = etat.marques.has(a.mentions[ip]);
          return '<span class="' + (trouve ? "personne trouvee" : "personne") + '">' + nomComplet(p) +
            (p.role ? ' <span class="role">(' + esc(couper(p.role, 40)) + ")</span>" : "") + "</span>";
        });
        return '<article class="carte-acte">' +
          '<header><button type="button" class="lien-acte titre-acte" data-acte="' + a.idx + '">' + esc(dateLisible(a.date)) + " — " + esc(a.type) + "</button>" +
          '<span class="meta">' + esc([a.lieu, a.notaire && "notaire " + a.notaire, a.cote].filter(Boolean).join(" · ")) + "</span></header>" +
          '<p class="resume">' + esc(couper(a.resume, 320)) + "</p>" +
          '<p class="personnes">' + personnes.join(", ") + "</p></article>";
      }).join("");
    }
    $("#liste").innerHTML = html;
    afficherPagination(nbPages);
  }

  function couper(s, n) {
    s = String(s || "");
    return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s;
  }

  function afficherPagination(nbPages) {
    var nav = $("#pagination");
    if (nbPages <= 1) { nav.innerHTML = ""; return; }
    var p = etat.page, pages = [];
    for (var i = 1; i <= nbPages; i++) {
      if (i === 1 || i === nbPages || Math.abs(i - p) <= 2) pages.push(i);
      else if (pages[pages.length - 1] !== "…") pages.push("…");
    }
    nav.innerHTML =
      '<button type="button" data-page="' + (p - 1) + '"' + (p === 1 ? " disabled" : "") + ">‹ Préc.</button>" +
      pages.map(function (n) {
        return n === "…" ? '<span class="ellipse">…</span>'
          : '<button type="button" data-page="' + n + '"' + (n === p ? ' aria-current="page"' : "") + ">" + n + "</button>";
      }).join("") +
      '<button type="button" data-page="' + (p + 1) + '"' + (p === nbPages ? " disabled" : "") + ">Suiv. ›</button>";
  }

  // ------------------------------------------------------------------ fiche d'acte
  function ouvrirFiche(idx) {
    var a = ACTES[idx];
    $("#fiche-titre").textContent = dateLisible(a.date) + " — " + a.type;
    var meta = [
      ["Lieu", a.lieu], ["Notaire", a.notaire], ["Dépôt", a.depot], ["Cote", a.cote],
      ["Transcription", a.etat], ["Confiance", a.confiance], ["Fiche", a.chemin],
    ].filter(function (x) { return x[1]; });
    var lignes = a.personnes.map(function (p, ip) {
      var trouve = etat.marques.has(a.mentions[ip]);
      return "<tr" + (trouve ? ' class="trouvee"' : "") + '><td data-l="Personne"><button type="button" class="lien-personne" data-nom="' + esc(p.nom) +
        '" data-prenom="' + esc(p.prenom) + '" title="Chercher cette personne dans tout l\'index">' + nomComplet(p) + "</button>" +
        (p.graphies.length ? '<div class="graphies">« ' + p.graphies.map(esc).join(" », « ") + " »</div>" : "") + "</td>" +
        '<td data-l="Rôle">' + esc(p.role) + "</td>" +
        '<td data-l="Qualité">' + esc([p.profession, p.residence, p.filiation].filter(Boolean).join(" · ")) + "</td></tr>";
    }).join("");
    function liste(titre, xs) {
      return xs.length ? "<h3>" + titre + "</h3><ul>" + xs.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "";
    }
    $("#fiche-corps").innerHTML =
      '<dl class="meta-fiche">' + meta.map(function (x) { return "<dt>" + x[0] + "</dt><dd>" + esc(x[1]) + "</dd>"; }).join("") + "</dl>" +
      "<h3>Résumé</h3><p>" + esc(a.resume) + "</p>" +
      "<h3>Personnes (" + a.personnes.length + ")</h3>" +
      '<table class="table-fiche"><thead><tr><th>Personne</th><th>Rôle</th><th>Profession, résidence, filiation</th></tr></thead><tbody>' + lignes + "</tbody></table>" +
      liste("Lieux cités", a.lieux) + liste("Sommes", a.sommes) +
      (a.mots.length ? '<h3>Mots-clés</h3><p class="mots-cles">' + a.mots.map(function (m) { return "<span>" + esc(m) + "</span>"; }).join("") + "</p>" : "");
    var d = $("#fiche");
    if (!d.open) d.showModal();
    d.scrollTop = 0;
  }

  // ------------------------------------------------------------------ adresse (partage)
  function sauverDansAdresse(e) {
    var params = new URLSearchParams();
    Object.keys(e).forEach(function (k) {
      if (e[k] !== DEFAUTS[k]) params.set(k, typeof e[k] === "boolean" ? (e[k] ? "1" : "0") : e[k]);
    });
    if (etat.vue !== "personnes") params.set("vue", etat.vue);
    if (etat.tri !== "date") params.set("tri", etat.tri);
    var h = params.toString();
    history.replaceState(null, "", h ? "#" + h : location.pathname + location.search);
  }
  function lireAdresse() {
    var params = new URLSearchParams(location.hash.slice(1));
    var e = {};
    params.forEach(function (v, k) {
      if (CASES.indexOf(k) >= 0) e[k] = v === "1";
      else e[k] = v;
    });
    if (e.vue === "actes") etat.vue = "actes";
    if (e.tri) { etat.tri = e.tri; $("#tri").value = e.tri; }
    ecrireFormulaire(e);
  }

  // ------------------------------------------------------------------ export CSV
  function exporterCSV() {
    var lignes;
    var c = function (s) { return '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"'; };
    if (etat.vue === "personnes") {
      lignes = [["Nom", "Prénom", "Graphies", "Rôle", "Profession", "Résidence", "Filiation", "Date", "Type", "Lieu", "Notaire", "Cote", "Acte"]]
        .concat(etat.personnes.map(function (m) {
          var p = m.p, a = m.acte;
          return [p.nom, p.prenom, p.graphies.join(" | "), p.role, p.profession, p.residence, p.filiation, a.date, a.type, a.lieu, a.notaire, a.cote, a.id];
        }));
    } else {
      lignes = [["Date", "Type", "Lieu", "Notaire", "Cote", "Personnes", "Résumé", "Acte"]]
        .concat(etat.actes.map(function (a) {
          return [a.date, a.type, a.lieu, a.notaire, a.cote,
            a.personnes.map(function (p) { return (p.prenom + " " + p.nom).trim(); }).join(" ; "), a.resume, a.id];
        }));
    }
    var csv = "﻿" + lignes.map(function (l) { return l.map(c).join(";"); }).join("\r\n");
    var url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    var lien = document.createElement("a");
    lien.href = url;
    lien.download = "notariat-saint-flour-" + etat.vue + ".csv";
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ------------------------------------------------------------------ événements
  var minuteur = null;
  function rechercherBientot() {
    clearTimeout(minuteur);
    minuteur = setTimeout(rechercher, 200);
  }
  form.addEventListener("input", rechercherBientot);
  form.addEventListener("change", rechercherBientot);
  form.addEventListener("submit", function (ev) { ev.preventDefault(); rechercher(); });

  function afficherPersonne2(oui) {
    $("#bloc-personne-2").hidden = !oui;
    $("#ajouter-personne-2").hidden = oui;
  }
  $("#ajouter-personne-2").addEventListener("click", function () {
    afficherPersonne2(true);
    form.elements.nom2.focus();
  });
  $("#retirer-personne-2").addEventListener("click", function () {
    ["nom2", "prenom2", "role2", "profession2", "residence2"].forEach(function (n) { form.elements[n].value = ""; });
    afficherPersonne2(false);
    rechercher();
  });
  $("#reinitialiser").addEventListener("click", function () {
    ecrireFormulaire({});
    rechercher();
  });

  $$(".onglets [role=tab]").forEach(function (b) {
    b.addEventListener("click", function () {
      etat.vue = b.dataset.vue;
      etat.page = 1;
      afficher();
      sauverDansAdresse(lireFormulaire());
    });
  });
  $("#tri").addEventListener("change", function (ev) {
    etat.tri = ev.target.value;
    trier();
    etat.page = 1;
    afficher();
    sauverDansAdresse(lireFormulaire());
  });
  $("#export-csv").addEventListener("click", exporterCSV);

  $("#pagination").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-page]");
    if (!b || b.disabled) return;
    etat.page = parseInt(b.dataset.page, 10);
    afficher();
    $(".resultats").scrollIntoView({ block: "start" });
  });
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest(".lien-acte");
    if (b) { ouvrirFiche(parseInt(b.dataset.acte, 10)); return; }
    var lp = ev.target.closest(".lien-personne");
    if (lp) {
      $("#fiche").close();
      ecrireFormulaire({ nom1: lp.dataset.nom, prenom1: lp.dataset.prenom });
      etat.vue = "personnes";
      rechercher();
    }
  });
  $("#fiche-fermer").addEventListener("click", function () { $("#fiche").close(); });
  $("#bouton-aide").addEventListener("click", function () { $("#aide").showModal(); });
  $$("[data-fermer]").forEach(function (b) { b.addEventListener("click", function () { b.closest("dialog").close(); }); });
  $$("dialog").forEach(function (d) {
    d.addEventListener("click", function (ev) { if (ev.target === d) d.close(); }); // clic hors de la fiche
  });
  $("#bouton-filtres").addEventListener("click", function () {
    var ouvert = form.classList.toggle("replie") === false;
    this.setAttribute("aria-expanded", String(ouvert));
  });

  // ------------------------------------------------------------------ démarrage
  $("#stats-globales").textContent = ACTES.length.toLocaleString("fr") + " actes, " +
    MENTIONS.length.toLocaleString("fr") + " mentions de personnes" +
    (DONNEES.genere_le ? " (index du " + DONNEES.genere_le.split("-").reverse().join("/") + ")" : "");
  if (window.matchMedia("(max-width: 860px)").matches) {
    form.classList.add("replie");
    $("#bouton-filtres").setAttribute("aria-expanded", "false");
  }
  lireAdresse();
  rechercher();
})();
