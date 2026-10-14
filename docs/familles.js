/* Onglet « Familles » (expérimental) : arbres reconstitués automatiquement
 * pour un nom de famille, à partir des liens de parenté des index.
 * Le calcul (familles-moteur.js) est fait à la première ouverture. */
(function () {
  "use strict";

  var P = window.Phonetique;
  var dialogue = document.getElementById("familles");
  var corps = document.getElementById("familles-resultats");
  var champ = document.getElementById("familles-nom");
  var base = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function nombre(n) { return n.toLocaleString("fr"); }
  var MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  function dateLisible(d) {
    if (!d || /^0000/.test(d)) return "date inconnue";
    var p = d.split("-"), m = parseInt(p[1], 10), j = parseInt(p[2], 10);
    return (j ? j + " " : "") + (m ? MOIS[m - 1] + " " : "") + p[0];
  }

  function preparer() {
    if (base) return true;
    var X = window.Explorateur;
    if (!X) return false;
    base = window.FamillesMoteur.construire(X.actes, X.mentions);
    // Suggestions : patronymes ayant le plus de liens de parenté.
    var parNom = new Map();
    base.individus.forEach(function (ind) {
      if (!ind.nom || ind.deduit) return;
      var k = ind.cleNomFamille;
      var e = parNom.get(k);
      if (!e) parNom.set(k, e = { formes: new Map(), liens: 0 });
      e.formes.set(ind.nom, (e.formes.get(ind.nom) || 0) + 1);
      e.liens += ind.parents.size + ind.enfants.size + ind.conjoints.size;
    });
    var liste = Array.from(parNom.values()).map(function (e) {
      var forme = "", n = -1;
      e.formes.forEach(function (c, f) { if (c > n) { n = c; forme = f; } });
      return { nom: forme, liens: e.liens };
    }).filter(function (e) { return e.nom.length > 1; }).sort(function (a, b) { return b.liens - a.liens; });
    document.getElementById("familles-liste-noms").innerHTML = liste.slice(0, 400)
      .map(function (e) { return '<option value="' + esc(e.nom) + '">'; }).join("");
    document.getElementById("familles-suggestions").innerHTML = "Les plus documentées : " + liste.slice(0, 12).map(function (e) {
      return '<button type="button" class="puce" data-nom="' + esc(e.nom) + '">' + esc(e.nom) + "</button>";
    }).join("");
    return true;
  }

  // ------------------------------------------------------------------ rendu d'un individu
  function libelle(ind) {
    return (ind.prenom ? esc(ind.prenom) + " " : "") + '<span class="patronyme">' + esc(ind.nom) + "</span>";
  }
  function meta(ind) {
    var m = [];
    if (ind.debut) m.push(ind.debut === ind.fin ? String(ind.debut) : ind.debut + "–" + ind.fin);
    if (ind.profession) m.push(esc(ind.profession));
    if (ind.residence && !/^saint-flour$/i.test(ind.residence)) m.push(esc(ind.residence));
    if (ind.feuAvant) m.push("† avant " + ind.feuAvant);
    if (ind.mentions.length) m.push(ind.mentions.length + (ind.mentions.length > 1 ? " mentions" : " mention"));
    var badges = "";
    if (ind.deduit) badges += '<span class="badge" title="Personne jamais nommée comme partie : connue seulement par la filiation d\'un autre">déduit</span>';
    if (ind.homonymes) badges += '<span class="badge" title="Plusieurs individus portent ce nom et ce prénom : ils ont pu être mal séparés ou mal regroupés">' + ind.homonymes + " homonymes</span>";
    if (ind.contradiction) badges += '<span class="badge badge-attention" title="Des liens incompatibles ont été écartés : probablement des homonymes confondus">liens incohérents</span>';
    return '<span class="fam-meta">' + m.join(" · ") + "</span>" + badges;
  }
  function sources(e) {
    return "d'après " + e.actes.map(function (a) { return dateLisible(a.date); }).join(", ");
  }
  function detail(ind) {
    var lignes = ind.mentions.slice().sort(function (a, b) { return (a.acte.date || "").localeCompare(b.acte.date || ""); })
      .map(function (x) {
        return '<li><button type="button" class="lien-acte" data-acte="' + x.acte.idx + '">' + esc(dateLisible(x.acte.date)) + " — " + esc(x.acte.type) + "</button> : " +
          esc(x.m.p.role) + (x.m.p.filiation ? ' <span class="fam-filiation">(' + esc(x.m.p.filiation) + ")</span>" : "") + "</li>";
      });
    var fr = [];
    ind.fratrie.forEach(function (e) { fr.push(libelle(e.ind)); });
    return '<div class="fam-detail" hidden>' +
      (fr.length ? "<p>Frère ou sœur de : " + fr.join(", ") + "</p>" : "") +
      (lignes.length ? "<ul>" + lignes.join("") + "</ul>" : "<p>Aucune mention directe : personne citée seulement dans la filiation d'un proche.</p>") +
      "</div>";
  }
  function ligne(ind, prefixe, titre) {
    return '<div class="fam-ligne">' + (prefixe ? '<span class="fam-lien" title="' + esc(titre || "") + '">' + prefixe + "</span>" : "") +
      '<button type="button" class="fam-personne" aria-expanded="false">' + libelle(ind) + "</button>" + meta(ind) + detail(ind) + "</div>";
  }

  // ------------------------------------------------------------------ arbre
  function arbres(fam) {
    var dansFamille = function (ind) { return fam.membres.has(ind.id) || fam.allies.has(ind.id); };
    var tous = new Map();
    fam.membres.forEach(function (v, k) { tous.set(k, v); });
    fam.allies.forEach(function (v, k) { tous.set(k, v); });
    var voisins = function (ind) {
      var v = [];
      [ind.parents, ind.enfants, ind.conjoints].forEach(function (m) { m.forEach(function (e) { if (dansFamille(e.ind)) v.push(e.ind); }); });
      return v;
    };
    // Composantes connexes.
    var vus = new Set(), composantes = [], isoles = [];
    fam.membres.forEach(function (ind) {
      if (vus.has(ind.id)) return;
      var pile = [ind], comp = [];
      vus.add(ind.id);
      while (pile.length) {
        var x = pile.pop();
        comp.push(x);
        voisins(x).forEach(function (y) { if (!vus.has(y.id)) { vus.add(y.id); pile.push(y); } });
      }
      if (comp.length > 1) composantes.push(comp); else isoles.push(ind);
    });
    composantes.sort(function (a, b) { return b.length - a.length; });

    var html = composantes.map(function (comp) {
      var dans = new Set(comp.map(function (x) { return x.id; }));
      var parentsDans = function (x) { var n = 0; x.parents.forEach(function (e) { if (dans.has(e.ind.id)) n++; }); return n; };
      var conjointAvecParents = function (x) {
        var r = false;
        x.conjoints.forEach(function (e) { if (dans.has(e.ind.id) && parentsDans(e.ind)) r = true; });
        return r;
      };
      var racines = comp.filter(function (x) { return !parentsDans(x) && !conjointAvecParents(x); })
        .sort(function (a, b) {
          var ma = fam.membres.has(a.id) ? 0 : 1, mb = fam.membres.has(b.id) ? 0 : 1;
          return ma - mb || (a.debut || 9999) - (b.debut || 9999);
        });
      if (!racines.length) racines = [comp[0]];
      var places = new Set();
      function rendre(x, prefixe, titre) {
        if (places.has(x.id)) return "<li>" + '<div class="fam-ligne fam-renvoi">' + (prefixe || "") + " " + libelle(x) + " <em>(voir plus haut)</em></div></li>";
        places.add(x.id);
        var conj = [];
        x.conjoints.forEach(function (e) { if (dans.has(e.ind.id) && !places.has(e.ind.id)) conj.push(e); });
        conj.forEach(function (e) { places.add(e.ind.id); });
        var enfants = new Map();
        [x].concat(conj.map(function (e) { return e.ind; })).forEach(function (p) {
          p.enfants.forEach(function (e) { if (dans.has(e.ind.id)) enfants.set(e.ind.id, e); });
        });
        var liste = Array.from(enfants.values()).sort(function (a, b) { return (a.ind.debut || 9999) - (b.ind.debut || 9999); });
        return "<li>" + ligne(x, prefixe, titre) +
          conj.map(function (e) {
            return '<div class="fam-conjoint">' + ligne(e.ind, "∞", e.deduit ? "couple déduit : parents d'un même enfant" : "conjoint, " + sources(e)) + "</div>";
          }).join("") +
          (liste.length ? '<ul class="fam-enfants">' + liste.map(function (e) { return rendre(e.ind, "", "enfant, " + sources(e)); }).join("") + "</ul>" : "") +
          "</li>";
      }
      // Une racine déjà placée comme conjoint d'une autre n'est pas répétée.
      var contenu = racines.map(function (r) { return places.has(r.id) ? "" : rendre(r, "", ""); }).join("");
      // Personnes restées hors arbre (liées seulement par un conjoint déjà placé, etc.).
      var restants = comp.filter(function (x) { return !places.has(x.id); });
      contenu += restants.map(function (r) { return rendre(r, "", ""); }).join("");
      return '<section class="fam-arbre"><h3>' + comp.length + " personnes liées</h3><ul class=\"fam-racine\">" + contenu + "</ul></section>";
    }).join("");

    return { html: html, nbArbres: composantes.length, isoles: isoles };
  }

  function afficher(nom) {
    nom = String(nom || "").trim();
    if (!nom) { corps.innerHTML = ""; return; }
    if (!preparer()) { corps.innerHTML = '<p class="vide">L\'index n\'est pas encore chargé.</p>'; return; }
    var fam = window.FamillesMoteur.famille(base, nom);
    if (!fam.membres.size) {
      corps.innerHTML = '<p class="vide">Aucun individu trouvé pour « ' + esc(nom) + ' ». La recherche se fait par proximité phonétique (Vergne = Vernhe).</p>';
      return;
    }
    var a = arbres(fam);
    var nbMentions = 0, liens = 0, actes = new Set();
    fam.membres.forEach(function (ind) {
      nbMentions += ind.mentions.length;
      ind.mentions.forEach(function (x) { actes.add(x.acte.idx); });
      liens += ind.parents.size + ind.enfants.size + ind.conjoints.size;
    });
    var isoles = a.isoles.slice().sort(function (x, y) { return x.prenom.localeCompare(y.prenom, "fr") || (x.debut || 0) - (y.debut || 0); });
    corps.innerHTML =
      '<p class="fam-resume"><strong>' + nombre(fam.membres.size) + "</strong> individus estimés pour ce nom (" + nombre(nbMentions) + " mentions dans " +
      nombre(actes.size) + " actes), <strong>" + nombre(a.nbArbres) + "</strong> groupes familiaux reconstitués, " + nombre(fam.allies.size) +
      " alliés d'autres noms. Cliquez sur une personne pour voir les actes qui la citent.</p>" +
      (a.html || '<p class="vide">Aucun lien de parenté trouvé pour ce nom.</p>') +
      (isoles.length ? '<details class="fam-isoles"><summary>' + nombre(isoles.length) + " individus du nom sans lien de parenté établi</summary><ul>" +
        isoles.map(function (ind) { return "<li>" + ligne(ind, "", "") + "</li>"; }).join("") + "</ul></details>" : "");
  }

  // ------------------------------------------------------------------ événements
  document.getElementById("bouton-familles").addEventListener("click", function () {
    dialogue.showModal();
    if (!preparer()) corps.innerHTML = '<p class="vide">Chargement de l\'index…</p>';
    champ.focus();
  });
  document.getElementById("familles-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    afficher(champ.value);
  });
  dialogue.addEventListener("click", function (ev) {
    var puce = ev.target.closest(".puce");
    if (puce) { champ.value = puce.dataset.nom; afficher(puce.dataset.nom); return; }
    var b = ev.target.closest(".fam-personne");
    if (b) {
      var d = b.parentNode.querySelector(".fam-detail");
      d.hidden = !d.hidden;
      b.setAttribute("aria-expanded", String(!d.hidden));
    }
  });
})();
