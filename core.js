/*!
 * Fake Roulette v1.0 — logika rdzenia (czysta, testowalna).
 * UMD: przeglądarka (window.RouletteCore) i Node (module.exports).
 *
 * Priorytet ustalania wyniku rundy:
 *   1. wymuszenie (config.forced[i]),
 *   2. połączenie z poprzedniego wyniku (pierwsze pasujące "from" wygrywa),
 *   3. losowanie.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RouletteCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function clampInt(value, min, max, fallback) {
    var n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(n)));
  }

  /**
   * Waliduje i normalizuje konfigurację.
   * raw: { choices: string[], links: [{from,to}], rounds: number, forced: (string|null)[] }
   */
  function normalizeConfig(raw) {
    raw = raw || {};

    var choices = [];
    if (Array.isArray(raw.choices)) {
      for (var i = 0; i < raw.choices.length; i++) {
        var name = String(raw.choices[i] == null ? "" : raw.choices[i]).trim();
        if (name && choices.indexOf(name) < 0) choices.push(name);
      }
    }

    var links = [];
    if (Array.isArray(raw.links)) {
      for (var j = 0; j < raw.links.length; j++) {
        var l = raw.links[j];
        if (!l || typeof l !== "object") continue;
        var from = String(l.from == null ? "" : l.from).trim();
        var to = String(l.to == null ? "" : l.to).trim();
        if (!from || !to || from === to) continue;
        if (choices.indexOf(from) < 0 || choices.indexOf(to) < 0) continue;
        var dup = false;
        for (var k = 0; k < links.length; k++) {
          if (links[k].from === from && links[k].to === to) { dup = true; break; }
        }
        if (!dup) links.push({ from: from, to: to });
      }
    }

    var rounds = clampInt(raw.rounds, 1, 30, 1);

    var forced = [];
    if (Array.isArray(raw.forced)) {
      var limit = Math.min(raw.forced.length, rounds);
      for (var m = 0; m < limit; m++) {
        var fname = String(raw.forced[m] == null ? "" : raw.forced[m]).trim();
        forced.push(choices.indexOf(fname) >= 0 ? fname : null);
      }
    }

    return { choices: choices, links: links, rounds: rounds, forced: forced };
  }

  /**
   * Losuje element z listy. rng = () => liczba [0,1). Pusta lista → null.
   */
  function pickRandom(items, rng) {
    if (!items || items.length === 0) return null;
    var r = rng();
    var idx = Math.min(items.length - 1, Math.max(0, Math.floor(r * items.length)));
    return items[idx];
  }

  /**
   * Ustala cel rundy i (indeksowanej od 0).
   * Zwraca null (losowo), { name, source: "link", link } lub { name, source: "forced", link: null }.
   */
  function resolveSpinTarget(config, spinIndex, previousResults) {
    if (!Number.isInteger(spinIndex) || spinIndex < 0) {
      throw new Error("spinIndex musi być liczbą całkowitą >= 0");
    }
    if (Array.isArray(config.forced) && spinIndex < config.forced.length && config.forced[spinIndex]) {
      return { name: config.forced[spinIndex], source: "forced", link: null };
    }
    if (spinIndex > 0 && Array.isArray(previousResults)) {
      var prev = previousResults[spinIndex - 1];
      if (prev && prev.name) {
        var links = config.links || [];
        for (var i = 0; i < links.length; i++) {
          if (links[i].from === prev.name) {
            return { name: links[i].to, source: "link", link: links[i] };
          }
        }
      }
    }
    return null;
  }

  /**
   * Symuluje całą grę. Wyniki rundy: { name, source: "random"|"link"|"forced", link } | null.
   */
  function runGame(config, rng) {
    var r = rng || Math.random;
    var results = [];
    for (var i = 0; i < config.rounds; i++) {
      var target = resolveSpinTarget(config, i, results);
      if (target) {
        results.push({ name: target.name, source: target.source, link: target.link });
      } else {
        var name = pickRandom(config.choices, r);
        results.push(name == null ? null : { name: name, source: "random", link: null });
      }
    }
    return { rounds: config.rounds, results: results };
  }

  return {
    clampInt: clampInt,
    normalizeConfig: normalizeConfig,
    pickRandom: pickRandom,
    resolveSpinTarget: resolveSpinTarget,
    runGame: runGame
  };
});
