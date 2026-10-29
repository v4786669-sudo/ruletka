"use strict";
/**
 * Testy logiki v1.3 (docs/core.js):
 *   - normalizeConfig {choices, pairs, series}: trim/dedup wyborów, walidacja
 *     par (nieznane/puste odrzucane, duplikaty dozwolone), series clamp 1–20,
 *   - buildSequence: pary → [a1, b1, a2, b2, ...] z source „para”; brak par →
 *     1 runda losowa (rng deterministyczny, source „losowo”),
 *   - flattenPairs, pickNextName (eliminacja: trafienia, pomijanie
 *     wylosowanych, fallback losowy),
 *   - pickRandom: brzegi, clampInt,
 *   - targetAngleForSpin/indexAtPointer: geometria lądowania (własności).
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../docs/core.js");

test("normalizeConfig: przycina i deduplikuje wybory", () => {
  const cfg = Core.normalizeConfig({ choices: [" Sofia ", "Sofia", "Wania", "", "  "], pairs: [] });
  assert.deepEqual(cfg.choices, ["Sofia", "Wania"]);
});

test("normalizeConfig: pary — nieznane/puste odrzucane, duplikaty dozwolone", () => {
  const cfg = Core.normalizeConfig({
    choices: ["Sofia", "Wania"],
    pairs: [
      { a: "Sofia", b: "Wania" },
      { a: "Sofia", b: "Wania" },    // duplikat — dozwolony
      { a: "Nieznana", b: "Wania" }, // a spoza wyborów — odrzuć
      { a: "Sofia", b: "X" },        // b spoza wyborów — odrzuć
      { a: " ", b: "Wania" },        // a puste po trim — odrzuć
      { a: "Sofia", b: "" },         // b puste — odrzuć
      null                           // nie-obiekt — odrzuć
    ]
  });
  assert.deepEqual(cfg.pairs, [
    { a: "Sofia", b: "Wania" },
    { a: "Sofia", b: "Wania" }
  ]);
});

test("normalizeConfig: pary wymagają obu imion z wyborów", () => {
  const cfg = Core.normalizeConfig({
    choices: ["Sofia"],
    pairs: [{ a: "Sofia", b: "Sofia" }, { a: "Sofia", b: "Wania" }]
  });
  assert.deepEqual(cfg, { choices: ["Sofia"], pairs: [{ a: "Sofia", b: "Sofia" }], series: 1 });
});

test("normalizeConfig: pusty/brakujący input → pusta konfiguracja", () => {
  assert.deepEqual(Core.normalizeConfig(), { choices: [], pairs: [], series: 1 });
  assert.deepEqual(Core.normalizeConfig({}), { choices: [], pairs: [], series: 1 });
});

test("buildSequence: pary → [a1, b1, a2, b2] z source „para”", () => {
  const cfg = Core.normalizeConfig({
    choices: ["Wania", "Sofia", "Lena", "Mateusz"],
    pairs: [{ a: "Wania", b: "Sofia" }, { a: "Lena", b: "Mateusz" }]
  });
  assert.deepEqual(Core.buildSequence(cfg, () => 0), [
    { name: "Wania", source: "para" },
    { name: "Sofia", source: "para" },
    { name: "Lena", source: "para" },
    { name: "Mateusz", source: "para" }
  ]);
});

test("buildSequence: kolejność par = kolejność rund (rng nie ma wpływu)", () => {
  const cfg = Core.normalizeConfig({
    choices: ["Wania", "Sofia", "Lena", "Mateusz"],
    pairs: [{ a: "Lena", b: "Mateusz" }, { a: "Wania", b: "Sofia" }]
  });
  assert.deepEqual(Core.buildSequence(cfg, () => 0).map((r) => r.name),
    ["Lena", "Mateusz", "Wania", "Sofia"]);
});

test("buildSequence: brak par → 1 runda losowa (rng deterministyczny, source „losowo”)", () => {
  const cfg = Core.normalizeConfig({ choices: ["A", "B", "C"], pairs: [] });
  assert.deepEqual(Core.buildSequence(cfg, () => 0), [{ name: "A", source: "losowo" }]);
  assert.deepEqual(Core.buildSequence(cfg, () => 0.999), [{ name: "C", source: "losowo" }]);
});

test("buildSequence: puste wybory i brak par → runda z name null", () => {
  assert.deepEqual(Core.buildSequence(Core.normalizeConfig({ choices: [], pairs: [] }), () => 0),
    [{ name: null, source: "losowo" }]);
});

test("pickRandom: rng=0 → pierwszy element, brzegi obcinane, pusta lista → null", () => {
  assert.equal(Core.pickRandom(["a", "b", "c"], () => 0), "a");
  assert.equal(Core.pickRandom(["a", "b", "c"], () => 0.999999), "c");
  assert.equal(Core.pickRandom(["a", "b"], () => 1), "b");     // górny brzeg obcinany
  assert.equal(Core.pickRandom(["a", "b"], () => -0.5), "a");  // ujemny obcinany
  assert.equal(Core.pickRandom([], () => 0), null);
});

test("clampInt: zaokrągla i obcina do zakresu, fallback dla nie-liczb", () => {
  assert.equal(Core.clampInt("5", 1, 30, 1), 5);
  assert.equal(Core.clampInt(99, 1, 30, 1), 30);
  assert.equal(Core.clampInt(0, 1, 30, 1), 1);
  assert.equal(Core.clampInt("x", 1, 30, 1), 1);
});

test("stare API v1.0/v1.1 usunięte, buildSequence istnieje", () => {
  assert.equal(Core.resolveSpinTarget, undefined, "resolveSpinTarget nie istnieje w v1.2");
  assert.equal(Core.runGame, undefined, "runGame nie istnieje w v1.2");
  assert.equal(typeof Core.buildSequence, "function", "buildSequence istnieje");
});

// ---------------------------------------------------------------------------
// WŁASNOŚĆ KRYTYCZNA (regresja bugu „koło ląduje na innym polu niż wynik”):
// dla dowolnej liczby segmentów i dowolnego celu, kąt docelowy liczony przez
// targetAngleForSpin musi zawsze wskazywać DOKŁADNIE segment celu — wtedy
// graficzne lądowanie pokrywa się z wynikiem ustawionym w konfiguracji.
// ---------------------------------------------------------------------------

test("targetAngleForSpin: wskaźnik zawsze ląduje na segmencie celu (własność)", () => {
  let seed = 123456789;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (const n of [2, 3, 4, 5, 6, 8, 12, 16, 30]) {
    let angle = Math.random() * 1000;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 50; k++) {
        const finalAngle = Core.targetAngleForSpin(i, n, angle, rng);
        assert.equal(Core.indexAtPointer(finalAngle, n), i,
          `n=${n} cel=${i} próba=${k} — koło wylądowało poza celem`);
        angle = finalAngle; // kolejne obroty kumulują kąt jak w prawdziwej grze
      }
    }
  }
});

test("targetAngleForSpin: jitter zostaje wewnątrz segmentu celu (bez przekroczenia krawędzi)", () => {
  let seed = 987654321;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let k = 0; k < 500; k++) {
    const finalAngle = Core.targetAngleForSpin(0, 6, 3.7, rng);
    assert.equal(Core.indexAtPointer(finalAngle, 6), 0);
  }
});

test("targetAngleForSpin/indexAtPointer: regresja bugu offsetu −π/2", () => {
  // Stary (błędny) wzór bez offsetu −π/2 lądował o 1,5 segmentu dalej:
  // cel=0 (Wania) trafiał wizualnie na segment 2 (Julia) przy 6 polach.
  // Nowy wzór musi mapować cel=0 → segment 0.
  assert.equal(Core.indexAtPointer(Core.targetAngleForSpin(0, 6, 0, () => 0.5), 6), 0);
  assert.equal(Core.indexAtPointer(Core.targetAngleForSpin(2, 6, 0, () => 0.5), 6), 2);
  assert.equal(Core.indexAtPointer(Core.targetAngleForSpin(5, 6, 0, () => 0.5), 6), 5);
  // kąt zerowy wskazuje segment 0 (góra koła)
  assert.equal(Core.indexAtPointer(0, 6), 0);
  assert.equal(Core.indexAtPointer(0, 2), 0);
});

// ---------------------------------------------------------------------------
// v1.3: series, flattenPairs, pickNextName (eliminacja z koła)
// ---------------------------------------------------------------------------

test("normalizeConfig: series clamp 1–20, domyślnie 1", () => {
  assert.equal(Core.normalizeConfig({ series: 0 }).series, 1);
  assert.equal(Core.normalizeConfig({ series: 99 }).series, 20);
  assert.equal(Core.normalizeConfig({ series: "3" }).series, 3);
  assert.equal(Core.normalizeConfig({ series: "x" }).series, 1);
  assert.equal(Core.normalizeConfig({}).series, 1);
});

test("normalizeConfig: series jest zwykłym enumerowalnym polem", () => {
  const cfg = Core.normalizeConfig({ choices: ["Sofia", "Wania"], pairs: [] });
  assert.deepEqual(Object.keys(cfg), ["choices", "pairs", "series"]);
  assert.equal(cfg.series, 1);
});

test("flattenPairs: pary → [a1, b1, a2, b2], puste wpisy pomijane", () => {
  assert.deepEqual(Core.flattenPairs([{ a: "Wania", b: "Sofia" }, { a: "Lena", b: "Mateusz" }]),
    ["Wania", "Sofia", "Lena", "Mateusz"]);
  assert.deepEqual(Core.flattenPairs([{ a: "", b: "Sofia" }, null, { a: "Lena" }]),
    ["Sofia", "Lena"]);
  assert.deepEqual(Core.flattenPairs([]), []);
});

test("pickNextName: trafienie w sekwencji od pos, pos=(idx+1)%len", () => {
  const seq = ["Wania", "Sofia", "Lena", "Mateusz"];
  const active = ["Sofia", "Lena", "Mateusz"]; // Wania już wylosowana
  assert.deepEqual(Core.pickNextName(seq, 1, active, () => 0),
    { name: "Sofia", source: "para", pos: 2 });
  // trafienie na ostatnim elemencie → pos zawija się na 0
  assert.deepEqual(Core.pickNextName(seq, 3, ["Mateusz"], () => 0),
    { name: "Mateusz", source: "para", pos: 0 });
});

test("pickNextName: pomija imiona spoza active i zawija sekwencję", () => {
  const seq = ["Wania", "Sofia"];
  const active = ["Sofia"];
  assert.deepEqual(Core.pickNextName(seq, 1, active, () => 0),
    { name: "Sofia", source: "para", pos: 0 });
  // od pos=0: „Wania” wylosowana → przechodzi do „Sofia”
  assert.deepEqual(Core.pickNextName(seq, 0, active, () => 0),
    { name: "Sofia", source: "para", pos: 0 });
});

test("pickNextName: pełne przejście bez trafienia → losowo z rng deterministycznym, pos bez zmian", () => {
  const seq = ["Wania", "Sofia"];
  const active = ["Lena", "Mateusz"]; // żadnego z seq nie ma już na kole
  assert.deepEqual(Core.pickNextName(seq, 1, active, () => 0),
    { name: "Lena", source: "losowo", pos: 1 });
  assert.deepEqual(Core.pickNextName(seq, 1, active, () => 0.999),
    { name: "Mateusz", source: "losowo", pos: 1 });
});

test("pickNextName: active puste → name null", () => {
  assert.deepEqual(Core.pickNextName(["Wania"], 0, [], () => 0),
    { name: null, source: "losowo", pos: 0 });
});

test("pickNextName: pusta sekwencja → losowo spośród active", () => {
  assert.deepEqual(Core.pickNextName([], 0, ["A", "B"], () => 0),
    { name: "A", source: "losowo", pos: 0 });
});

test("pickNextName: pos spoza zakresu → start od 0", () => {
  assert.deepEqual(Core.pickNextName(["Wania", "Sofia"], 7, ["Wania"], () => 0),
    { name: "Wania", source: "para", pos: 1 });
});
