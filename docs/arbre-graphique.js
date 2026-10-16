/* Arbre généalogique graphique (descendant, façon Geneanet) d'un groupe familial
 * reconstitué par familles-moteur.js. Dessin en SVG : couples côte à côte,
 * enfants en dessous, cases bleues (hommes) / roses (femmes) / grises (inconnu).
 * Appelé par familles.js : window.ArbreGraphique.ouvrir(composante, membres). */
(function () {
  "use strict";

  var L = 172, H = 64;          // taille d'une case
  var ECART_CONJOINT = 30;      // entre deux conjoints
  var ECART_FRERES = 18;        // entre deux sous-arbres frères
  var ECART_RACINES = 48;       // entre deux arbres racines
  var ETAGE = H + 64;           // hauteur d'une génération
  var MARGE = 24;

  var dialogue = document.getElementById("arbre-graphique");
  var zone = document.getElementById("arbre-zone");
  var panneau = document.getElementById("arbre-detail");
  var titre = document.getElementById("arbre-titre");
  var echelle = 1, svgCourant = null, dimensions = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  function dateLisible(d) {
    if (!d || /^0000/.test(d)) return "date inconnue";
    var p = d.split("-"), m = parseInt(p[1], 10), j = parseInt(p[2], 10);
    return (j ? j + " " : "") + (m ? MOIS[m - 1] + " " : "") + p[0];
  }
  function couper(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  // ------------------------------------------------------------------ structure
  // Même règle que la vue en liste : racines = personnes sans parent dans le groupe
  // (et dont le conjoint n'en a pas) ; chaque personne n'est dessinée qu'une fois,
  // les autres occurrences deviennent des renvois en pointillés.
  function structure(comp, membres) {
    var dans = new Set(comp.map(function (x) { return x.id; }));
    var parentsDans = function (x) { var n = 0; x.parents.forEach(function (e) { if (dans.has(e.ind.id)) n++; }); return n; };
    var conjointAvecParents = function (x) {
      var r = false;
      x.conjoints.forEach(function (e) { if (dans.has(e.ind.id) && parentsDans(e.ind)) r = true; });
      return r;
    };
    var racines = comp.filter(function (x) { return !parentsDans(x) && !conjointAvecParents(x); })
      .sort(function (a, b) {
        var ma = membres.has(a.id) ? 0 : 1, mb = membres.has(b.id) ? 0 : 1;
        return ma - mb || (a.debut || 9999) - (b.debut || 9999);
      });
    if (!racines.length) racines = [comp[0]];
    var places = new Set();
    function noeud(x) {
      if (places.has(x.id)) return { ind: x, renvoi: true, conjoints: [], enfants: [] };
      places.add(x.id);
      var conj = [];
      x.conjoints.forEach(function (e) { if (dans.has(e.ind.id) && !places.has(e.ind.id)) conj.push(e); });
      conj.forEach(function (e) { places.add(e.ind.id); });
      // Chaque enfant est rattaché à l'union dont il est issu : groupe 0 = la personne seule
      // (autre parent inconnu), groupe i = avec le i-ème conjoint.
      var enfants = new Map();
      [x].concat(conj.map(function (e) { return e.ind; })).forEach(function (p) {
        p.enfants.forEach(function (e) { if (dans.has(e.ind.id)) enfants.set(e.ind.id, e.ind); });
      });
      var groupeDe = function (enf) {
        for (var i = 0; i < conj.length; i++) if (enf.parents.has(conj[i].ind.id)) return i + 1;
        return 0;
      };
      var liste = Array.from(enfants.values()).map(function (enf) { return { ind: enf, groupe: groupeDe(enf) }; })
        .sort(function (a, b) {
          // Enfants du 1er conjoint à gauche… ceux sans autre parent connu en premier.
          var ga = a.groupe === 0 ? 0.5 : a.groupe, gb = b.groupe === 0 ? 0.5 : b.groupe;
          return ga - gb || (a.ind.debut || 9999) - (b.ind.debut || 9999);
        });
      var noeuds = liste.map(function (e) { var n = noeud(e.ind); n.groupe = e.groupe; return n; });
      return { ind: x, conjoints: conj, enfants: noeuds };
    }
    var arbres = [];
    racines.forEach(function (r) { if (!places.has(r.id)) arbres.push(noeud(r)); });
    comp.forEach(function (x) { if (!places.has(x.id)) arbres.push(noeud(x)); });
    return arbres;
  }

  // ------------------------------------------------------------------ mise en page
  function largeurCouple(n) { return L * (1 + n.conjoints.length) + ECART_CONJOINT * n.conjoints.length; }
  function mesurer(n) {
    n.enfants.forEach(mesurer);
    n.largeurEnfants = n.enfants.reduce(function (s, e) { return s + e.largeur; }, 0) + ECART_FRERES * Math.max(0, n.enfants.length - 1);
    n.largeur = Math.max(largeurCouple(n), n.largeurEnfants);
  }
  function placer(n, x0, niveau, cases, traits) {
    var y = MARGE + niveau * ETAGE;
    var xc = x0 + (n.largeur - largeurCouple(n)) / 2;
    var principal = { ind: n.ind, x: xc, y: y, renvoi: n.renvoi };
    cases.push(principal);
    var droite = xc + L;
    n.conjoints.forEach(function (e, i) {
      var x = xc + (L + ECART_CONJOINT) * (i + 1);
      cases.push({ ind: e.ind, x: x, y: y, deduitCouple: e.deduit });
      // Trait d'union entre conjoints, avec le symbole du mariage.
      traits.push({ type: "union", x1: x - ECART_CONJOINT, x2: x, y: y + H / 2, deduit: e.deduit });
      droite = x + L;
    });
    if (!n.enfants.length) return;
    var xe = x0 + (n.largeur - n.largeurEnfants) / 2;
    var parGroupe = new Map();
    n.enfants.forEach(function (e) {
      placer(e, xe, niveau + 1, cases, traits);
      var c = xe + (e.largeur - largeurCouple(e)) / 2 + L / 2;
      if (!parGroupe.has(e.groupe)) parGroupe.set(e.groupe, []);
      parGroupe.get(e.groupe).push(c);
      xe += e.largeur + ECART_FRERES;
    });
    var yBas = y + H + (ETAGE - H);
    var k = 0;
    parGroupe.forEach(function (centres, g) {
      // Départ : milieu de l'union concernée, ou bas de la case pour un parent seul.
      var xDepart = g === 0 ? xc + L / 2 : xc + (L + ECART_CONJOINT) * g - ECART_CONJOINT / 2;
      var yDepart = g === 0 ? y + H : y + H / 2;
      // Barres légèrement décalées d'une union à l'autre pour rester lisibles.
      var yBarre = y + H + (ETAGE - H) / 2 - 8 * (parGroupe.size - 1) / 2 + 8 * k++;
      traits.push({ type: "ligne", x1: xDepart, y1: yDepart, x2: xDepart, y2: yBarre });
      var gauche = Math.min(xDepart, centres[0]), droiteB = Math.max(xDepart, centres[centres.length - 1]);
      traits.push({ type: "ligne", x1: gauche, y1: yBarre, x2: droiteB, y2: yBarre });
      centres.forEach(function (c) { traits.push({ type: "ligne", x1: c, y1: yBarre, x2: c, y2: yBas }); });
    });
  }
  function profondeur(n) { return 1 + n.enfants.reduce(function (m, e) { return Math.max(m, profondeur(e)); }, 0); }

  // ------------------------------------------------------------------ dessin
  function couleurs() {
    var cs = getComputedStyle(document.documentElement);
    var v = function (n, d) { return (cs.getPropertyValue(n) || d).trim() || d; };
    return {
      fond: v("--surface", "#ffffff"), fond2: v("--surface-2", "#edf1f7"), texte: v("--texte", "#182033"),
      doux: v("--texte-doux", "#5a6479"), trait: v("--texte-doux", "#5a6479"), or: v("--or", "#e2b13c"),
      homme: v("--sexe-h", "#dbe6f6"), femme: v("--sexe-f", "#f8dfe6"), inconnu: v("--sexe-i", "#e9e7e3"),
    };
  }
  function dessiner(arbres, membres) {
    var cases = [], traits = [], x = MARGE, maxNiv = 0;
    arbres.forEach(function (a) {
      mesurer(a);
      placer(a, x, 0, cases, traits);
      x += a.largeur + ECART_RACINES;
      maxNiv = Math.max(maxNiv, profondeur(a));
    });
    var largeur = Math.max(x - ECART_RACINES + MARGE, 300);
    var hauteur = MARGE * 2 + (maxNiv - 1) * ETAGE + H;
    var c = couleurs();
    var out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + largeur + " " + hauteur + '" width="' + largeur + '" height="' + hauteur +
      '" font-family="Inter, system-ui, sans-serif" role="img" aria-label="Arbre généalogique reconstitué">');
    out.push('<rect width="100%" height="100%" fill="' + c.fond2 + '"/>');
    traits.forEach(function (t) {
      if (t.type === "ligne") {
        out.push('<line x1="' + t.x1 + '" y1="' + t.y1 + '" x2="' + t.x2 + '" y2="' + t.y2 + '" stroke="' + c.trait + '" stroke-width="1.5"/>');
      } else {
        out.push('<line x1="' + t.x1 + '" y1="' + t.y + '" x2="' + t.x2 + '" y2="' + t.y + '" stroke="' + c.or + '" stroke-width="2.5"' +
          (t.deduit ? ' stroke-dasharray="4 3"' : "") + "/>");
        out.push('<text x="' + (t.x1 + t.x2) / 2 + '" y="' + (t.y - 6) + '" text-anchor="middle" font-size="13" font-weight="700" fill="' + c.or + '">∞</text>');
      }
    });
    cases.forEach(function (k, i) {
      var ind = k.ind;
      // Aplat de couleur selon le sexe estimé ; contour pointillé seulement pour un renvoi ou une personne déduite.
      var fond = ind.sexe === "M" ? c.homme : ind.sexe === "F" ? c.femme : c.inconnu;
      var allie = !membres.has(ind.id);
      var contour = k.renvoi || ind.deduit ? ' stroke="' + c.doux + '" stroke-width="1.2" stroke-dasharray="5 3"' : "";
      var dates = [];
      if (ind.debut) dates.push(ind.debut === ind.fin ? String(ind.debut) : ind.debut + "–" + ind.fin);
      if (ind.feuAvant) dates.push("† av. " + ind.feuAvant);
      var sous = k.renvoi ? "voir ailleurs dans l'arbre" : ind.deduit ? "déduit (filiation)" : dates.join("  ");
      var info = ind.prenom + " " + ind.nom + (ind.profession ? " — " + ind.profession : "") + (ind.residence ? " — " + ind.residence : "") +
        (ind.mentions.length ? " — " + ind.mentions.length + " mention(s)" : "");
      out.push('<g class="case" data-i="' + i + '" tabindex="0" role="button" style="cursor:pointer">');
      out.push("<title>" + esc(info) + "</title>");
      out.push('<rect x="' + k.x + '" y="' + k.y + '" width="' + L + '" height="' + H + '" rx="12" fill="' + (k.renvoi ? c.fond : fond) + '"' +
        (allie && !k.renvoi ? ' fill-opacity="0.6"' : "") + contour + "/>");
      out.push('<text x="' + (k.x + 14) + '" y="' + (k.y + 20) + '" font-size="12.5" fill="' + c.texte + '">' + esc(couper(ind.prenom, 24)) + "</text>");
      out.push('<text x="' + (k.x + 14) + '" y="' + (k.y + 37) + '" font-size="13.5" font-weight="700" fill="' + c.texte + '">' + esc(couper(ind.nom, 20)) + "</text>");
      out.push('<text x="' + (k.x + 14) + '" y="' + (k.y + 54) + '" font-size="11" fill="' + c.doux + '">' + esc(couper(sous, 28)) + "</text>");
      out.push("</g>");
    });
    out.push("</svg>");
    return { svg: out.join(""), cases: cases, largeur: largeur, hauteur: hauteur };
  }

  // ------------------------------------------------------------------ interface
  function appliquerEchelle() {
    if (!svgCourant) return;
    svgCourant.setAttribute("width", Math.round(dimensions.largeur * echelle));
    svgCourant.setAttribute("height", Math.round(dimensions.hauteur * echelle));
    document.getElementById("arbre-echelle").textContent = Math.round(echelle * 100) + " %";
  }
  function ajuster() {
    var dispo = zone.clientWidth - 8;
    echelle = Math.max(0.3, Math.min(1, dispo / dimensions.largeur));
    appliquerEchelle();
  }
  function detail(ind) {
    var lignes = ind.mentions.slice().sort(function (a, b) { return (a.acte.date || "").localeCompare(b.acte.date || ""); })
      .map(function (x) {
        return '<li><button type="button" class="lien-acte" data-acte="' + x.acte.idx + '">' + esc(dateLisible(x.acte.date)) + " — " + esc(x.acte.type) +
          "</button> : " + esc(x.m.p.role) + (x.m.p.filiation ? ' <span class="fam-filiation">(' + esc(x.m.p.filiation) + ")</span>" : "") + "</li>";
      });
    var rel = function (map) { var r = []; map.forEach(function (e) { r.push(esc(e.ind.prenom + " " + e.ind.nom)); }); return r.join(", "); };
    var bloc = [];
    if (ind.parents.size) bloc.push("<dt>Parents</dt><dd>" + rel(ind.parents) + "</dd>");
    if (ind.conjoints.size) bloc.push("<dt>Conjoint(s)</dt><dd>" + rel(ind.conjoints) + "</dd>");
    if (ind.enfants.size) bloc.push("<dt>Enfants</dt><dd>" + rel(ind.enfants) + "</dd>");
    if (ind.fratrie.size) bloc.push("<dt>Frères et sœurs</dt><dd>" + rel(ind.fratrie) + "</dd>");
    panneau.innerHTML = "<h3>" + esc(ind.prenom) + ' <span class="patronyme">' + esc(ind.nom) + "</span></h3>" +
      (ind.variantes && ind.variantes.length ? '<p class="fam-variantes">Aussi écrit : ' + ind.variantes.map(esc).join(", ") + " (variantes regroupées automatiquement)</p>" : "") +
      (bloc.length ? '<dl class="arbre-relations">' + bloc.join("") + "</dl>" : "") +
      (lignes.length ? "<ul>" + lignes.join("") + "</ul>" : "<p>Personne connue seulement par la filiation d'un proche (individu déduit).</p>");
    panneau.hidden = false;
  }

  function ouvrir(comp, membres, nomFamille) {
    var arbres = structure(comp, membres);
    dimensions = dessiner(arbres, membres);
    zone.innerHTML = dimensions.svg;
    svgCourant = zone.querySelector("svg");
    titre.textContent = "Arbre reconstitué — " + nomFamille + " (" + comp.length + " personnes)";
    panneau.hidden = true;
    panneau.innerHTML = "";
    if (!dialogue.open) dialogue.showModal();
    ajuster();
    zone.scrollLeft = 0; zone.scrollTop = 0;
  }

  zone.addEventListener("click", function (ev) {
    if (zone.dataset.glisse === "1") return;
    var g = ev.target.closest(".case");
    if (!g) return;
    detail(dimensions.cases[parseInt(g.dataset.i, 10)].ind);
  });
  zone.addEventListener("keydown", function (ev) {
    var g = ev.target.closest && ev.target.closest(".case");
    if (g && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); detail(dimensions.cases[parseInt(g.dataset.i, 10)].ind); }
  });
  // Déplacement à la souris (cliquer-glisser).
  var glisse = null;
  zone.addEventListener("mousedown", function (ev) {
    glisse = { x: ev.clientX, y: ev.clientY, sl: zone.scrollLeft, st: zone.scrollTop, bouge: false };
    zone.dataset.glisse = "0";
  });
  window.addEventListener("mousemove", function (ev) {
    if (!glisse) return;
    var dx = ev.clientX - glisse.x, dy = ev.clientY - glisse.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) { glisse.bouge = true; zone.classList.add("glisse"); }
    zone.scrollLeft = glisse.sl - dx; zone.scrollTop = glisse.st - dy;
  });
  window.addEventListener("mouseup", function () {
    if (glisse && glisse.bouge) { zone.dataset.glisse = "1"; setTimeout(function () { zone.dataset.glisse = "0"; }, 0); }
    glisse = null; zone.classList.remove("glisse");
  });
  document.getElementById("arbre-plus").addEventListener("click", function () { echelle = Math.min(2, echelle * 1.25); appliquerEchelle(); });
  document.getElementById("arbre-moins").addEventListener("click", function () { echelle = Math.max(0.2, echelle / 1.25); appliquerEchelle(); });
  document.getElementById("arbre-ajuster").addEventListener("click", ajuster);
  document.getElementById("arbre-svg").addEventListener("click", function () {
    if (!svgCourant) return;
    var clone = svgCourant.cloneNode(true);
    clone.setAttribute("width", dimensions.largeur); clone.setAttribute("height", dimensions.hauteur);
    var url = URL.createObjectURL(new Blob([clone.outerHTML], { type: "image/svg+xml" }));
    var a = document.createElement("a");
    a.href = url; a.download = "arbre-" + titre.textContent.replace(/^.*— /, "").replace(/\s*\(.*$/, "").toLowerCase() + ".svg";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  window.ArbreGraphique = { ouvrir: ouvrir };
})();
