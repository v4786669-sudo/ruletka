"use strict";
/**
 * Smoke test UI v1.3 (jsdom): ładuje prawdziwą stronę z docs/
 * (index.html + core.js + app.js) i weryfikuje:
 *   - boot: canvas z wymiarami, neutralny branding (zero „fake”/„fałszyw”),
 *   - ręczne rundy: jeden klik Start = jeden obrót; wynik w overlayu
 *     #result-overlay (wielka nazwa w #result), zamykanie klikiem;
 *     dopóki overlay otwarty, Start nie zaczyna kolejnego obrotu,
 *   - eliminacja: wylosowane imię znika z koła; po wylosowaniu wszystkich
 *     koło się odnawia (następna seria) albo gra się kończy,
 *   - serie: round-info „Seria X z N · Na kole: Y”, po końcu
 *     „Koniec gry — kliknij Start”; kolejny Start = nowa gra od serii 1,
 *   - fallback losowy spośród pozostałych (deterministyczny rng),
 *   - migracja „ruletka-v2” → „ruletka-v3” (series=1, stary klucz usunięty).
 */
const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const SITE = path.join(ROOT, "docs");
const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
const coreSrc = fs.readFileSync(path.join(SITE, "core.js"), "utf8");
const appSrc = fs.readFileSync(path.join(SITE, "app.js"), "utf8");

// twardy limit bezpieczeństwa: gdyby coś zawisło, test i tak się zakończy
setTimeout(() => {
  console.error("SMOKE TEST FAIL: przekroczono limit czasu (240 s)");
  process.exit(1);
}, 240000);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// czeka (co 100 ms) aż warunek będzie spełniony; fail po timeout
async function waitFor(cond, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return;
    await wait(100);
  }
  assert.fail(label);
}

// atrapa kontekstu canvas (jsdom nie rysuje)
function makeFakeCtx() {
  return new Proxy({}, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => "";
      if (!(p in t)) t[p] = function () {};
      return t[p];
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}

// uruchamia stronę w świeżym JSDOM. storageSeed = {klucz: wartość} ustawiane
// PRZED załadowaniem skryptów; rngStub (opcjonalny) podmienia Math.random
// w oknie strony (np. deterministyczne losowanie fallbacku).
function bootPage(storageSeed, rngStub) {
  const dom = new JSDOM(html, {
    url: "http://localhost:4173/",
    runScripts: "dangerously",
    pretendToBeVisual: true
  });
  const w = dom.window;
  w.HTMLCanvasElement.prototype.getContext = function () { return makeFakeCtx(); };
  if (storageSeed) {
    for (const [k, v] of Object.entries(storageSeed)) w.localStorage.setItem(k, v);
  }
  if (rngStub) w.Math.random = rngStub;
  w.eval(coreSrc);
  w.eval(appSrc);
  return { window: w, d: w.document };
}

function overlayVisible(ctx) {
  return !ctx.d.getElementById("result-overlay").classList.contains("hidden");
}
function resultName(ctx) {
  return ctx.d.getElementById("result").textContent;
}
function roundInfo(ctx) {
  return ctx.d.getElementById("round-info").textContent;
}

// Jeden ręczny obrót: Start → overlay z oczekiwanym imieniem → dismiss klikiem.
async function spinOnce(ctx, expectedName) {
  ctx.d.getElementById("btn-spin").click();
  await waitFor(() => overlayVisible(ctx),
    `overlay wyniku widoczny po obrocie (${expectedName})`, 8000);
  assert.equal(resultName(ctx), expectedName,
    `wynik na overlayu = ${expectedName} (jest: „${resultName(ctx)}”)`);
  ctx.d.getElementById("result-overlay").click(); // klik gdziekolwiek zamyka
  await waitFor(() => !overlayVisible(ctx),
    "overlay znika po kliknięciu", 2000);
}

(async () => {
  // ================= instancja A: preset v3, 2 serie =================
  const A = bootPage({
    "ruletka-v3": JSON.stringify({
      choices: ["Wania", "Sofia", "Lena", "Mateusz"],
      pairs: [{ a: "Wania", b: "Sofia" }, { a: "Lena", b: "Mateusz" }],
      series: 2
    })
  });
  const d = A.d;

  // 1) boot: canvas + neutralny branding
  const canvas = d.getElementById("wheel");
  assert.ok(canvas, "canvas koła istnieje");
  assert.ok(canvas.width > 0 && canvas.height > 0,
    "canvas ma wymiary (" + canvas.width + "×" + canvas.height + ")");
  const brandChecks = [
    ["<title>", d.title],
    ["nagłówek", d.querySelector("header").textContent],
    ["stopka", d.querySelector("footer").textContent],
    ["meta description", d.querySelector('meta[name="description"]').content]
  ];
  for (const [where, text] of brandChecks) {
    assert.ok(!/fake|fałszyw/i.test(text),
      where + " jest neutralne (bez „fake”/„fałszyw”): „" + text + "”");
  }
  assert.equal(d.querySelector("header h1").textContent, "Ruletka", "nagłówek to „Ruletka”");
  assert.ok(d.querySelector("footer").textContent.includes("v1.3"), "stopka z wersją v1.3");
  assert.equal(d.getElementById("btn-spin").textContent, "🎡 Start",
    "przycisk ma zawsze tekst „🎡 Start”");
  assert.ok(d.getElementById("result-overlay").classList.contains("hidden"),
    "overlay wyniku domyślnie ukryty");
  assert.ok(d.getElementById("result-overlay").contains(d.getElementById("result")),
    "#result jest wewnątrz #result-overlay");
  assert.equal(roundInfo(A), "Naciśnij „Start”, aby zakręcić",
    "round-info przed grą zachęca do Startu");

  // 2) ustawienia: ⚙️ w nagłówku + sekcja Serie (wartość z presetu)
  const settingsBtn = d.querySelector("header #btn-settings");
  assert.ok(settingsBtn, "przycisk ⚙️ ustawień jest w nagłówku");
  settingsBtn.click();
  assert.ok(!d.getElementById("settings-overlay").classList.contains("hidden"),
    "⚙️ otwiera ustawienia zwykłym klikiem");
  assert.equal(d.querySelectorAll("#pairs-list .row").length, 2, "2 pary w ustawieniach (preset)");
  assert.equal(d.getElementById("input-series").value, "2", "sekcja Serie pokazuje 2 (preset)");
  d.getElementById("btn-close-settings").click();
  assert.ok(d.getElementById("settings-overlay").classList.contains("hidden"),
    "ustawienia zamknięte");

  // 3) seria 1: cztery ręczne obroty z eliminacją
  // pierwszy obrót + sprawdzenie, że otwarty overlay blokuje kolejny Start
  d.getElementById("btn-spin").click();
  await waitFor(() => overlayVisible(A), "overlay po 1. obrocie", 8000);
  assert.equal(resultName(A), "Wania", "1. obrót: „Wania”");
  d.getElementById("btn-spin").click(); // próba obrotu przy otwartym overlayu
  await wait(300);
  assert.equal(resultName(A), "Wania", "Start zablokowany, dopóki overlay otwarty");
  assert.equal(overlayVisible(A), true, "overlay nadal widoczny po próbie Startu");
  d.getElementById("result-overlay").click();
  await waitFor(() => !overlayVisible(A), "overlay znika po kliknięciu", 2000);

  await spinOnce(A, "Sofia");
  await spinOnce(A, "Lena");
  await spinOnce(A, "Mateusz"); // po nim: koło puste → odnowienie serii 2

  const afterSeries1 = roundInfo(A);
  assert.ok(afterSeries1.includes("Seria 2 z 2"),
    "po 4. obrocie seria 2 z 2: „" + afterSeries1 + "”");
  assert.ok(afterSeries1.includes("Na kole: 4"),
    "koło odnowione — na kole 4: „" + afterSeries1 + "”");

  // 4) seria 2: ponownie 4 obroty → koniec gry
  await spinOnce(A, "Wania");
  await spinOnce(A, "Sofia");
  await spinOnce(A, "Lena");
  await spinOnce(A, "Mateusz");
  assert.equal(roundInfo(A), "Koniec gry — kliknij Start",
    "po ostatniej serii round-info = koniec gry");

  // 5) kolejny Start = nowa gra od serii 1
  d.getElementById("btn-spin").click();
  await waitFor(() => overlayVisible(A), "overlay po starcie nowej gry", 8000);
  assert.equal(resultName(A), "Wania", "nowa gra od serii 1: „Wania”");
  assert.ok(roundInfo(A).includes("Seria 1 z 2"),
    "nowa gra zaczyna się od serii 1: „" + roundInfo(A) + "”");

  // ================= instancja B: sekwencja krótsza niż lista graczy =================
  // rng=0 → fallback losuje ZAWSZE pierwszy element listy pozostałych.
  const B = bootPage({
    "ruletka-v3": JSON.stringify({
      choices: ["Wania", "Sofia", "Lena", "Mateusz"],
      pairs: [{ a: "Wania", b: "Sofia" }],
      series: 1
    })
  }, () => 0);

  await spinOnce(B, "Wania");
  await spinOnce(B, "Sofia");
  await spinOnce(B, "Lena");     // po parze: losowo spośród pozostałych (rng=0 → Lena)
  await spinOnce(B, "Mateusz");  // ostatni gracz
  assert.equal(roundInfo(B), "Koniec gry — kliknij Start",
    "instancja B: koniec gry po wylosowaniu wszystkich");

  // ================= instancja C: migracja v2 → v3 =================
  const C = bootPage({
    "ruletka-v2": JSON.stringify({
      choices: ["Sofia", "Wania", "Julia", "Maja"],
      pairs: [{ a: "Sofia", b: "Wania" }]
    })
  });
  assert.equal(C.window.localStorage.getItem("ruletka-v2"), null,
    "stary klucz „ruletka-v2” usunięty po migracji");
  const migrated = JSON.parse(C.window.localStorage.getItem("ruletka-v3"));
  assert.deepEqual(migrated.choices, ["Sofia", "Wania", "Julia", "Maja"],
    "migracja: choices przeniesione z v2");
  assert.deepEqual(migrated.pairs, [{ a: "Sofia", b: "Wania" }],
    "migracja: pairs przeniesione z v2");
  assert.equal(migrated.series, 1, "migracja: series = 1");
  assert.ok(C.d.getElementById("wheel"), "strona z migrowaną konfiguracją wstaje");

  console.log("SMOKE TEST OK — v1.3: overlay wyniku (dismiss), eliminacja, serie z odnowieniem koła, koniec gry i nowa gra, fallback losowy (rng=0), migracja v2→v3.");
  process.exit(0);
})().catch((e) => {
  console.error("SMOKE TEST FAIL:", e && e.message ? e.message : e);
  process.exit(1);
});
