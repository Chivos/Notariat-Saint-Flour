/*
 * Chargement de l'index (index/index.json) puis démarrage de l'explorateur.
 *
 * L'index est lu, dans l'ordre :
 *  1. à côté de la page (site publié par GitHub Actions, qui y copie index.json) ;
 *  2. dans ../index/ (dépôt complet servi localement) ;
 *  3. sur GitHub (raw.githubusercontent.com), par exemple si la page est
 *     ouverte directement depuis le disque.
 * Il n'y a donc rien à régénérer : pousser index/index.json suffit.
 */
(function () {
  "use strict";

  var DEPOT = "Chivos/Notariat-Saint-Flour", BRANCHE = "main";
  var URL_BRUTE = "https://raw.githubusercontent.com/" + DEPOT + "/" + BRANCHE + "/";

  // Regroupement des types d'actes (le champ « type » est parfois très détaillé).
  var GROUPES_TYPES = [
    ["contrat de mariage", "contrat de mariage"], ["mariage", "contrat de mariage"],
    ["testament", "testament"], ["codicille", "testament"],
    ["revente", "vente"], ["ratification de vente", "vente"], ["vente", "vente"],
    ["donation", "donation"], ["transaction", "transaction"], ["quittance", "quittance"],
    ["échange", "échange"], ["echange", "échange"], ["obligation", "obligation"],
    ["bail", "bail"], ["partage", "partage"], ["inventaire", "inventaire"],
    ["cession", "cession / subrogation"], ["subrogation", "cession / subrogation"],
    ["démission", "démission / désistement"], ["désistement", "démission / désistement"],
    ["constitution de rente", "constitution de rente"], ["procuration", "procuration"],
    ["contrat d'apprentissage", "apprentissage"],
  ];
  function groupeType(t) {
    t = String(t || "").trim().toLowerCase();
    for (var i = 0; i < GROUPES_TYPES.length; i++) {
      if (t.lastIndexOf(GROUPES_TYPES[i][0], 0) === 0) return GROUPES_TYPES[i][1];
    }
    if (t.lastIndexOf("autre", 0) === 0) return "autre";
    return t || "inconnu";
  }
  function notaireNormalise(n) {
    n = String(n || "").toUpperCase();
    if (n.indexOf("SOURZAT") >= 0) return "SOURZAT";
    if (n.indexOf("PAGÈS") >= 0 || n.indexOf("PAGES") >= 0) return "PAGÈS";
    if (n.indexOf("PAYEN") >= 0) return "PAYEN";
    return "non identifié";
  }

  function convertir(donnees) {
    return {
      genere_le: donnees.genere_le || "",
      actes: (donnees.actes || []).map(function (a) {
        return {
          id: a.id, chemin: a.chemin || "",
          type: a.type || "", tg: groupeType(a.type),
          date: a.date_acte || "", lieu: a.lieu || "",
          notaire: a.notaire || "", ng: notaireNormalise(a.notaire),
          depot: a.depot || "", cote: a.cote || "",
          etat: a.etat_transcription || "", confiance: a.confiance || "",
          personnes: (a.personnes || []).map(function (p) {
            return {
              nom: p.nom || "", prenom: p.prenom || "", graphies: p.graphies || [],
              role: p.role || "", profession: p.profession || "",
              residence: p.residence || "", filiation: p.filiation || "",
            };
          }),
          lieux: a.lieux_cites || [], sommes: a.sommes || [], mots: a.mots_cles || [],
          resume: a.resume || "",
        };
      }),
    };
  }

  var sources = [];
  if (/^https?:$/.test(location.protocol)) sources.push("index.json", "../index/index.json");
  sources.push(URL_BRUTE + "index/index.json");

  function essai(i) {
    return fetch(sources[i], { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).catch(function (err) {
      if (i + 1 < sources.length) return essai(i + 1);
      throw err;
    });
  }

  essai(0).then(function (donnees) {
    window.INDEX_NOTARIAT = convertir(donnees);
    window.demarrerExplorateur();
  }).catch(function (err) {
    document.getElementById("stats-globales").textContent = "index introuvable";
    document.getElementById("liste").innerHTML =
      '<p class="vide">Impossible de charger l\'index des actes (' + String(err.message || err) +
      "). Vérifiez la connexion internet puis rechargez la page.</p>";
  });
})();
