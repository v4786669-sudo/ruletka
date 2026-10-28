"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../core.js");

test("normalizeConfig: przycina i deduplikuje wybory", () => {
  const cfg = Core.normalizeConfig({ choices: [" Sofia ", "Sofia", "Wania", ""], links: [], rounds: 1, forced: [] });
  assert.deepEqual(cfg.choices, ["Sofia", "Wania"]);
});

test("normalizeConfig: odrzuca nieprawidłowe połączenia", () => {
  const cfg = Core.normalizeConfig({
    choices: ["Sofia", "Wania"],
    links: [
      { from: "Sofia", to: "Nieznana" },   // cel spoza wyborów
      { from: "Sofia", to: "Sofia" },      // pętla do siebie
      { from: "Sofia", to: "Wania" },
      { from: "Sofia", to: "Wania" }       // duplikat
    ],
    rounds: 1,
    forced: []
  });
  assert.deepEqual(cfg.links, [{ from: "Sofia", to: "Wania" }]);
});

test("normalizeConfig: przycina liczbę rund do 1..30", () => {
  assert.equal(Core.normalizeConfig({ rounds: 0 }).rounds, 1);
  assert.equal(Core.normalizeConfig({ rounds: 99 }).rounds, 30);
  assert.equal(Core.normalizeConfig({ rounds: "5" }).rounds, 5);
  assert.equal(Core.normalizeConfig({ rounds: "x" }).rounds, 1);
});

test("normalizeConfig: wymuszenia obcinane do liczby rund i walidowane", () => {
  const cfg = Core.normalizeConfig({ choices: ["Sofia"], rounds: 3, forced: ["Sofia", "X", "Sofia", "Sofia"] });
  assert.deepEqual(cfg.forced, ["Sofia", null, "Sofia"]);
});

test("resolveSpinTarget: wymuszenie ma priorytet nad połączeniem", () => {
  const config = { choices: ["a", "b"], links: [{ from: "a", to: "b" }], forced: ["b"] };
  assert.deepEqual(Core.resolveSpinTarget(config, 0, []), { name: "b", source: "forced", link: null });
});

test("resolveSpinTarget: połączenie odpala się po wylosowaniu źródła", () => {
  const config = { choices: ["a", "b"], links: [{ from: "a", to: "b" }], forced: [] };
  assert.equal(Core.resolveSpinTarget(config, 0, []), null);
  assert.deepEqual(Core.resolveSpinTarget(config, 1, [{ name: "a" }]), {
    name: "b", source: "link", link: { from: "a", to: "b" }
  });
  assert.equal(Core.resolveSpinTarget(config, 1, [{ name: "b" }]), null);
});

test("runGame: łańcuch połączeń a→b→c daje sekwencję a, b, c", () => {
  const config = Core.normalizeConfig({
    choices: ["a", "b", "c"],
    links: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
    rounds: 3
  });
  const game = Core.runGame(config, () => 0); // rng=0 → zawsze pierwszy wybór
  assert.deepEqual(game.results.map(r => r.name), ["a", "b", "c"]);
  assert.deepEqual(game.results.map(r => r.source), ["random", "link", "link"]);
});

test("runGame: wymuszenie przebija połączenie w rundzie 2", () => {
  const config = Core.normalizeConfig({
    choices: ["a", "b", "c"],
    links: [{ from: "a", to: "b" }],
    rounds: 2,
    forced: [null, "c"]
  });
  const game = Core.runGame(config, () => 0);
  assert.deepEqual(game.results.map(r => r.name), ["a", "c"]);
  assert.deepEqual(game.results.map(r => r.source), ["random", "forced"]);
});

test("runGame: pierwsze z kilku połączeń o tym samym źródle wygrywa", () => {
  const config = Core.normalizeConfig({
    choices: ["a", "b", "c"],
    links: [{ from: "a", to: "b" }, { from: "a", to: "c" }],
    rounds: 2
  });
  const game = Core.runGame(config, () => 0);
  assert.deepEqual(game.results.map(r => r.name), ["a", "b"]);
});

test("pickRandom: rng=0 daje pierwszy element, wartości z brzegu są obcinane", () => {
  assert.equal(Core.pickRandom(["a", "b", "c"], () => 0), "a");
  assert.equal(Core.pickRandom(["a", "b", "c"], () => 0.999999), "c");
  assert.equal(Core.pickRandom([], () => 0), null);
});
