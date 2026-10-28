"use strict";
/**
 * Smoke test UI (jsdom): ładuje prawdziwy index.html + core.js + app.js,
 * symuluje kliknięcia i weryfikuje pełny przebieg gry:
 *   runda 1 = Sofia (wymuszona), runda 2 = Wania (połączenie Sofia → Wania).
 */
const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const coreSrc = fs.readFileSync(path.join(__dirname, "..", "core.js"), "utf8");
const appSrc = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

// atrapa kontekstu canvas (jsdom nie rysuje)
const fakeCtx = new Proxy({}, {
  get(t, p) {
    if (p === Symbol.toPrimitive) return () => "";
    if (!(p in t)) t[p] = function () {};
    return t[p];
  },
  set(t, p, v) { t[p] = v; return true; }
});

const dom = new JSDOM(html, {
  url: "http://localhost:4173/",
  runScripts: "dangerously",
  pretendToBeVisual: true
});
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = function () { return fakeCtx; };

// konfiguracja testowa: 4 wybory, połączenie Sofia→Wania, 2 rundy, runda 1 wymuszona = Sofia
window.localStorage.setItem("fake-roulette-v1", JSON.stringify({
  choices: ["Sofia", "Wania", "Julia", "Maja"],
  links: [{ from: "Sofia", to: "Wania" }],
  rounds: 2,
  forced: ["Sofia"]
}));

window.eval(coreSrc);
window.eval(appSrc);

const d = window.document;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) strona wstała
assert.ok(d.getElementById("wheel"), "canvas koła istnieje");
assert.ok(d.getElementById("wheel").width > 0, "canvas ma wymiary");
assert.ok(d.getElementById("btn-spin").textContent.includes("2 rund"), d.getElementById("btn-spin").textContent);

// 2) ustawienia: modal się otwiera, domyślne połączenie widoczne
d.getElementById("btn-settings").click();
assert.ok(!d.getElementById("settings-overlay").classList.contains("hidden"), "okno ustawień otwarte");
assert.equal(d.querySelectorAll("#links-list .row").length, 1, "1 połączenie w ustawieniach");
assert.equal(d.querySelectorAll("#forced-list .row").length, 1, "1 wymuszenie w ustawieniach");
d.getElementById("btn-close-settings").click();

(async () => {
  // 3) start gry — runda 1 (wymuszona: Sofia)
  d.getElementById("btn-spin").click();
  assert.equal(d.getElementById("result").textContent, "Kręcimy…");
  await wait(5200);
  assert.equal(d.getElementById("result").textContent, "Wypadło: Sofia");

  // 4) runda 2 — połączenie Sofia → Wania
  d.getElementById("btn-spin").click();
  await wait(5600);
  assert.equal(d.getElementById("result").textContent, "Wypadło: Wania");

  const items = Array.from(d.querySelectorAll("#history li"));
  assert.equal(items.length, 2, "historia ma 2 rundy");
  assert.ok(items[0].textContent.includes("połączenie: Sofia → Wania"), "runda 2 oznaczona jako połączenie: " + items[0].textContent);
  assert.ok(items[1].textContent.includes("wymuszone"), "runda 1 oznaczona jako wymuszona: " + items[1].textContent);

  // 5) podsumowanie gry
  assert.ok(!d.getElementById("summary-overlay").classList.contains("hidden"), "podsumowanie widoczne");
  assert.equal(d.querySelectorAll("#summary-list li").length, 2, "podsumowanie ma 2 pozycje");

  console.log("SMOKE TEST OK — pełny przebieg Sofia→Wania zweryfikowany w symulowanym DOM.");
  process.exit(0);
})().catch((e) => {
  console.error("SMOKE TEST FAIL:", e && e.message ? e.message : e);
  process.exit(1);
});
