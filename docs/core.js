/*!
 * Ruletka v1.3 — logika rdzenia (czysta, testowalna).
 * UMD: przeglądarka (window.RouletteCore) i Node (module.exports).
 *
 * Konfiguracja: { choices: string[], pairs: [{ a, b }, ...], series: 1–20 }.
 * Kolejność rund = kolejność par (każda para to 2 obroty: a, potem b).
 * Eliminacja: po wylosowaniu imię znika z koła; gdy koło puste, seria
 * się odnawia (albo kończy grę — decyduje warstwa UI).
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
   * raw: { choices: string[], pairs: [{ a, b }, ...], series?: number }
   * Wybory: przycinane i deduplikowane. Pary: a i b muszą być w choices;
   * puste lub nieprawidłowe pary są odrzucane; duplikaty par dozwolone.
   * series: clampInt 1–20, domyślnie 1.
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

    var pairs = [];
    if (Array.isArray(raw.pairs)) {
      for (var j = 0; j < raw.pairs.length; j++) {
        var p = raw.pairs[j];
        if (!p || typeof p !== "object") continue;
        var a = String(p.a == null ? "" : p.a).trim();
        var b = String(p.b == null ? "" : p.b).trim();
        if (!a || !b) continue;
        if (choices.indexOf(a) < 0 || choices.indexOf(b) < 0) continue;
        pairs.push({ a: a, b: b });
      }
    }

    return { choices: choices, pairs: pairs, series: clampInt(raw.series, 1, 20, 1) };
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
   * Buduje sekwencję rund całej gry: pary → [a1, b1, a2, b2, ...].
   * Każda para = 2 obroty (najpierw a, potem b). Brak par → jedna runda
   * losowa. Wynik rundy: { name, source: "para" | "losowo" }.
   */
  function buildSequence(config, rng) {
    var r = rng || Math.random;
    var results = [];
    var pairs = (config && Array.isArray(config.pairs)) ? config.pairs : [];

    if (pairs.length === 0) {
      var name = pickRandom((config && config.choices) || [], r);
      results.push({ name: name, source: "losowo" });
      return results;
    }

    for (var i = 0; i < pairs.length; i++) {
      results.push({ name: pairs[i].a, source: "para" });
      results.push({ name: pairs[i].b, source: "para" });
    }
    return results;
  }

  /**
   * Spłaszcza pary do listy imion: [{a,b},...] → [a1, b1, a2, b2, ...].
   * Puste wpisy są pomijane.
   */
  function flattenPairs(pairs) {
    var seq = [];
    if (Array.isArray(pairs)) {
      for (var i = 0; i < pairs.length; i++) {
        var p = pairs[i];
        if (!p || typeof p !== "object") continue;
        if (p.a) seq.push(p.a);
        if (p.b) seq.push(p.b);
      }
    }
    return seq;
  }

  /**
   * Wybiera kolejne imię do wylosowania przy eliminacji.
   *   sequence — spłaszczona kolejność par (flattenPairs),
   *   pos — pozycja startowa w sequence,
   *   active — imiona wciąż obecne na kole,
   *   rng — generator liczb [0,1).
   * Idzie po sequence od pos i pomija imiona spoza active (już wylosowane).
   * Trafienie → { name, source: "para", pos: (idx + 1) % len }.
   * Pełne przejście bez trafienia → { name: pickRandom(active, rng),
   *   source: "losowo", pos bez zmian }.
   * Puste active → { name: null, source: "losowo", pos }.
   */
  function pickNextName(sequence, pos, active, rng) {
    var r = rng || Math.random;
    var len = (Array.isArray(sequence) && sequence.length > 0) ? sequence.length : 0;
    var start = (Number.isInteger(pos) && pos >= 0 && pos < len) ? pos : 0;

    if (!Array.isArray(active) || active.length === 0) {
      return { name: null, source: "losowo", pos: start };
    }

    for (var i = 0; i < len; i++) {
      var idx = (start + i) % len;
      var name = sequence[idx];
      if (name && active.indexOf(name) >= 0) {
        return { name: name, source: "para", pos: (idx + 1) % len };
      }
    }

    return { name: pickRandom(active, r), source: "losowo", pos: start };
  }

  /**
   * Kąt docelowy obrotu koła (radiany, wartość rosnąca), przy którym
   * wskaźnik (góra koła, kąt ekranowy -π/2) wskazuje środek segmentu
   * choiceIndex ± drobny losowy jitter wewnątrz segmentu.
   * Geometria musi być zgodna z rysowaniem w app.js: segment i rysowany
   * jest od kąta lokalnego -π/2 + i*seg, a płótno jest obracane o `angle`.
   */
  function targetAngleForSpin(choiceIndex, n, currentAngle, rng) {
    if (!n || n <= 0) return currentAngle || 0;
    var r = rng || Math.random;
    var seg = (Math.PI * 2) / n;
    var idx = Math.max(0, Math.min(n - 1, Math.floor(choiceIndex)));
    var jitter = (r() - 0.5) * seg * 0.55;
    var targetPointer = -Math.PI / 2 + idx * seg + seg / 2 + jitter;
    var targetMod = (((-Math.PI / 2 - targetPointer) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    var baseMod = (((currentAngle || 0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    var delta = (targetMod - baseMod + Math.PI * 2) % (Math.PI * 2);
    var turns = Math.floor(5 + r() * 4) * Math.PI * 2; // 5–8 PEŁNYCH obrotów (wielokrotność 2π!)
    return (currentAngle || 0) + delta + turns;
  }

  /**
   * Indeks segmentu, na który wskazuje wskaźnik (góra koła) przy danym
   * kącie obrotu. Odwrotność targetAngleForSpin — używana w testach
   * własnościowych (koło graficzne musi lądować na segmencie celu).
   */
  function indexAtPointer(angle, n) {
    if (!n || n <= 0) return -1;
    var seg = (Math.PI * 2) / n;
    var local = (((-Math.PI / 2 - angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.floor((local + Math.PI / 2) / seg) % n;
  }

  return {
    clampInt: clampInt,
    normalizeConfig: normalizeConfig,
    pickRandom: pickRandom,
    buildSequence: buildSequence,
    flattenPairs: flattenPairs,
    pickNextName: pickNextName,
    targetAngleForSpin: targetAngleForSpin,
    indexAtPointer: indexAtPointer
  };
});
