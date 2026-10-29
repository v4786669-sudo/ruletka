"use strict";
/**
 * Testy logiki v1.2 (docs/core.js):
 *   - normalizeConfig {choices, pairs}: trim/dedup wyborów, walidacja par
 *     (nieznane/puste odrzucane, duplikaty dozwolone),
 *   - buildSequence: pary → [a1, b1, a2, b2, ...] z source „para”; brak par →
 *     1 runda losowa (rng deterministyczny, source „losowo”),
 *   - pickRandom: brzegi, clampInt.
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
  assert.deepEqual(cfg, { choices: ["Sofia"], pairs: [{ a: "Sofia", b: "Sofia" }] });
});

test("normalizeConfig: pusty/brakujący input → pusta konfiguracja", () => {
  assert.deepEqual(Core.normalizeConfig(), { choices: [], pairs: [] });
  assert.deepEqual(Core.normalizeConfig({}), { choices: [], pairs: [] });
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
