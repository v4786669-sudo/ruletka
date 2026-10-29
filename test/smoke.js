"use strict";
/**
 * Smoke test UI v1.2 (jsdom): ładuje prawdziwą stronę z docs/
 * (index.html + core.js + app.js) i weryfikuje:
 *   - boot: canvas z wymiarami, neutralny branding (zero „fake”/„fałszyw”),
 *   - widoczny przycisk ustawień ⚙️ w nagłówku; otwiera settings-overlay
 *     zwykłym klikiem; sekcja „Kolejność rund” (pairs-list),
 *   - zapis ustawień działa (localStorage „ruletka-v2”),
 *   - auto-odgrywanie całej sekwencji: Wania → Sofia → Lena → Mateusz
 *     (animacja ~4,2 s + pauza ~1,4 s; defensywny waitFor zamiast sztywnych
 *     sleepów); po końcu Start znów aktywny,
 *   - brak #history i #summary-overlay w DOM,
 *   - migracja ze starego klucza „ruletka-v1” (links → pairs, stary klucz
 *     usunięty),
 *   - konfiguracja domyślna (6 wyborów, 1 para Wania → Sofia).
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
  console.error("SMOKE TEST FAIL: przekroczono limit czasu (90 s)");
  process.exit(1);
}, 90000);

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

// uruchamia stronę w świeżym JSDOM; storageSeed = {klucz: wartość} ustawiane
// PRZED załadowaniem skryptów (symuluje stan przeglądarki przed bootem).
function bootPage(storageSeed) {
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
  w.eval(coreSrc);
  w.eval(appSrc);
  return { window: w, d: w.document };
}

(async () => {
  // ================= instancja A: preset v2 + pełny przebieg =================
  const A = bootPage({
    "ruletka-v2": JSON.stringify({
      choices: ["Wania", "Sofia", "Lena", "Mateusz"],
      pairs: [{ a: "Wania", b: "Sofia" }, { a: "Lena", b: "Mateusz" }]
    })
  });
  const d = A.d;
  const result = () => d.getElementById("result").textContent;
  const spinBtn = () => d.getElementById("btn-spin");

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
  assert.ok(d.querySelector("footer").textContent.includes("v1.2"), "stopka z wersją v1.2");
  assert.equal(spinBtn().textContent, "🎡 Start", "przycisk ma zawsze tekst „🎡 Start”");

  // 2) brak historii i podsumowania
  assert.equal(d.getElementById("history"), null, "brak #history w DOM");
  assert.equal(d.getElementById("summary-overlay"), null, "brak #summary-overlay w DOM");
  assert.equal(d.getElementById("summary-list"), null, "brak #summary-list w DOM");
  assert.equal(d.getElementById("btn-summary-close"), null, "brak #btn-summary-close w DOM");

  // 3) ustawienia: widoczny przycisk w nagłówku, otwiera zwykłym klikiem
  const settingsBtn = d.querySelector("header #btn-settings");
  assert.ok(settingsBtn, "przycisk ⚙️ ustawień jest w nagłówku");
  assert.ok(d.getElementById("settings-overlay").classList.contains("hidden"),
    "settings-overlay domyślnie ukryty");
  settingsBtn.click();
  assert.ok(!d.getElementById("settings-overlay").classList.contains("hidden"),
    "⚙️ otwiera ustawienia zwykłym klikiem");
  assert.equal(d.querySelectorAll("#choices-list .row").length, 4, "4 wybory w ustawieniach (preset)");
  assert.equal(d.querySelectorAll("#pairs-list .row").length, 2, "2 pary w ustawieniach (preset)");
  d.getElementById("btn-close-settings").click();
  assert.ok(d.getElementById("settings-overlay").classList.contains("hidden"),
    "ustawienia zamknięte przyciskiem ✕");

  // 4) auto-odgrywanie: Start → cała sekwencja z presetu
  spinBtn().click();
  assert.equal(result(), "Kręcimy…", "po starcie „Kręcimy…”");
  assert.equal(spinBtn().disabled, true, "Start zablokowany podczas gry");

  // animacja ~4,2 s + pauza ~1,4 s między rundami → defensywne czekanie
  await waitFor(() => result() === "Wypadło: Wania", "runda 1: „Wypadło: Wania”", 7000);
  await waitFor(() => result() === "Wypadło: Sofia", "runda 2: „Wypadło: Sofia”", 9000);
  await waitFor(() => result() === "Wypadło: Lena", "runda 3: „Wypadło: Lena”", 9000);
  await waitFor(() => result() === "Wypadło: Mateusz", "runda 4: „Wypadło: Mateusz”", 9000);
  await waitFor(() => spinBtn().disabled === false, "po końcu Start znów aktywny", 5000);

  assert.equal(d.getElementById("round-info").textContent, "Runda 4 z 4",
    "wskaźnik postępu „Runda 4 z 4”");
  assert.equal(result(), "Wypadło: Mateusz", "ostatni wynik zostaje na ekranie");

  // 5) zapis ustawień działa (po grze): dodaj parę i zapisz
  settingsBtn.click();
  assert.ok(!d.getElementById("settings-overlay").classList.contains("hidden"));
  d.getElementById("btn-add-pair").click();
  assert.equal(d.querySelectorAll("#pairs-list .row").length, 3,
    "„+ Dodaj rundę” dodaje trzecią parę w edycji");
  d.getElementById("btn-save-settings").click();
  assert.ok(d.getElementById("settings-overlay").classList.contains("hidden"),
    "okno ustawień zamknięte po zapisie");
  assert.equal(d.getElementById("toast").textContent, "✅ Ustawienia zapisane",
    "toast potwierdza zapis");
  const saved = JSON.parse(A.window.localStorage.getItem("ruletka-v2"));
  assert.equal(saved.choices.length, 4, "zapis: 4 wybory w „ruletka-v2”");
  assert.equal(saved.pairs.length, 3, "zapis: 3 pary w „ruletka-v2”");
  assert.equal(result(), "Naciśnij „Start”, aby zakręcić", "zapis resetuje stan gry");

  // ================= instancja B: migracja ze starego klucza v1 =================
  const B = bootPage({
    "ruletka-v1": JSON.stringify({
      choices: ["Sofia", "Wania", "Julia", "Maja"],
      links: [{ from: "Sofia", to: "Wania" }],
      rounds: 2,
      forced: ["Sofia"]
    })
  });
  assert.equal(B.window.localStorage.getItem("ruletka-v1"), null,
    "stary klucz „ruletka-v1” usunięty po migracji");
  const migrated = JSON.parse(B.window.localStorage.getItem("ruletka-v2"));
  assert.deepEqual(migrated.choices, ["Sofia", "Wania", "Julia", "Maja"],
    "migracja: choices przeniesione z v1");
  assert.deepEqual(migrated.pairs, [{ a: "Sofia", b: "Wania" }],
    "migracja: links → pairs [{a: Sofia, b: Wania}]");
  assert.ok(B.d.getElementById("wheel"), "strona z migrowaną konfiguracją wstaje");

  // ================= instancja C: konfiguracja domyślna =================
  const C = bootPage(null);
  C.d.getElementById("btn-settings").click();
  assert.equal(C.d.querySelectorAll("#choices-list .row").length, 6,
    "domyślnie 6 wyborów");
  assert.equal(C.d.querySelectorAll("#pairs-list .row").length, 1,
    "domyślnie 1 para w „Kolejności rund”");
  const pairSelects = C.d.querySelectorAll("#pairs-list .row select");
  assert.equal(pairSelects[0].value, "Wania", "para domyślna: a = Wania");
  assert.equal(pairSelects[1].value, "Sofia", "para domyślna: b = Sofia");
  assert.equal(C.d.getElementById("btn-spin").disabled, false,
    "Start aktywny przy domyślnej konfiguracji");
  C.d.getElementById("btn-close-settings").click();

  console.log("SMOKE TEST OK — v1.2: boot/branding, ⚙️ w nagłówku, pary rund (Wania→Sofia→Lena→Mateusz), brak historii, zapis ustawień, migracja v1→v2, domyślne.");
  process.exit(0);
})().catch((e) => {
  console.error("SMOKE TEST FAIL:", e && e.message ? e.message : e);
  process.exit(1);
});
