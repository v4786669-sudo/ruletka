"use strict";
/**
 * Smoke test UI v1.1 (jsdom): ładuje prawdziwy index.html + core.js + app.js,
 * symuluje kliknięcia i weryfikuje:
 *   - boot: canvas z wymiarami, neutralny branding (bez „fake”/„fałszyw”),
 *   - ukryte ustawienia: brak widocznego przycisku; sekret właściciela =
 *     5 szybkich kliknięć w środek koła (piastę) w oknie 2,5 s + toast
 *     „Tryb właściciela”,
 *   - pełny przebieg gry: runda 1 = Sofia (wymuszona), runda 2 = Wania
 *     (połączenie Sofia → Wania); animacja koła trwa ~4,2 s,
 *   - historia neutralna domyślnie; etykiety źródeł (wymuszone/połączenie)
 *     widoczne dopiero po otwarciu ustawień (tryb właściciela),
 *   - podsumowanie gry z 2 pozycjami.
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

// Preset gry (nowy, neutralny klucz „ruletka-v1”): 4 wybory, połączenie
// Sofia→Wania, 2 rundy, runda 1 wymuszona = Sofia.
window.localStorage.setItem("ruletka-v1", JSON.stringify({
  choices: ["Sofia", "Wania", "Julia", "Maja"],
  links: [{ from: "Sofia", to: "Wania" }],
  rounds: 2,
  forced: ["Sofia"]
}));

window.eval(coreSrc);
window.eval(appSrc);

const d = window.document;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// twardy limit bezpieczeństwa: gdyby coś zawisło, test i tak się zakończy
setTimeout(() => {
  console.error("SMOKE TEST FAIL: przekroczono limit czasu (60 s)");
  process.exit(1);
}, 60000);

// czeka (co 100 ms) aż warunek będzie spełniony; fail po timeout
async function waitFor(cond, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return;
    await wait(100);
  }
  assert.fail(label);
}

// Kliknięcie w środek koła (piastę). App liczy pozycję przez
// getBoundingClientRect() + clientX/clientY; w jsdom rect = 0, więc
// środek = canvas.width/2, canvas.height/2 (canvas ma 420×420 po resize).
function clickWheelCenter() {
  const canvas = d.getElementById("wheel");
  canvas.dispatchEvent(new window.MouseEvent("click", {
    bubbles: true,
    clientX: canvas.width / 2,
    clientY: canvas.height / 2
  }));
}

// ===== 1) boot + neutralny branding =====
const canvas = d.getElementById("wheel");
assert.ok(canvas, "canvas koła istnieje");
assert.ok(canvas.width > 0, "canvas ma szerokość > 0 (" + canvas.width + ")");
assert.ok(canvas.height > 0, "canvas ma wysokość > 0 (" + canvas.height + ")");

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
assert.ok(d.querySelector("footer").textContent.includes("v1.1"), "stopka z wersją v1.1");
assert.ok(d.getElementById("btn-spin").textContent.includes("2 rund"),
  "przycisk startu pokazuje 2 rundy: " + d.getElementById("btn-spin").textContent);

// ===== 2) ustawienia ukryte =====
assert.equal(d.getElementById("btn-settings"), null, "brak widocznego przycisku ustawień");
assert.ok(Array.from(d.querySelectorAll("button")).every((b) => !b.textContent.includes("Ustawienia")),
  "żaden przycisk nie prowadzi do ustawień");
assert.ok(d.getElementById("settings-overlay").classList.contains("hidden"),
  "settings-overlay domyślnie ukryty");

(async () => {
  // ===== 3) pełny przebieg gry — runda 1 (wymuszona: Sofia) =====
  d.getElementById("btn-spin").click();
  assert.equal(d.getElementById("result").textContent, "Kręcimy…", "stan „Kręcimy…” po starcie");
  await wait(5200); // animacja koła trwa ~4,2 s
  await waitFor(() => d.getElementById("result").textContent === "Wypadło: Sofia",
    "runda 1: „Wypadło: Sofia”", 4000);

  // ===== 4) runda 2 — połączenie Sofia → Wania =====
  d.getElementById("btn-spin").click();
  await wait(5600);
  await waitFor(() => d.getElementById("result").textContent === "Wypadło: Wania",
    "runda 2: „Wypadło: Wania”", 4000);

  // ===== 5) historia neutralna (bez trybu właściciela) =====
  const items = Array.from(d.querySelectorAll("#history li"));
  assert.equal(items.length, 2, "historia ma 2 rundy");
  assert.ok(items[0].textContent.includes("Runda 2") && items[0].textContent.includes("Wania"),
    "historia[0] = runda 2, Wania: „" + items[0].textContent + "”");
  assert.ok(items[1].textContent.includes("Runda 1") && items[1].textContent.includes("Sofia"),
    "historia[1] = runda 1, Sofia: „" + items[1].textContent + "”");
  for (const li of items) {
    assert.ok(!/wymuszone|połączenie/i.test(li.textContent),
      "historia neutralna — bez źródeł: „" + li.textContent + "”");
  }

  // ===== 6) podsumowanie gry =====
  await waitFor(() => !d.getElementById("summary-overlay").classList.contains("hidden"),
    "podsumowanie widoczne po zakończeniu gry", 4000);
  const sumItems = Array.from(d.querySelectorAll("#summary-list li"));
  assert.equal(sumItems.length, 2, "podsumowanie ma 2 pozycje");
  assert.ok(sumItems[0].textContent.includes("Runda 1") && sumItems[0].textContent.includes("Sofia"),
    "podsumowanie[0] = runda 1, Sofia: „" + sumItems[0].textContent + "”");
  assert.ok(sumItems[1].textContent.includes("Runda 2") && sumItems[1].textContent.includes("Wania"),
    "podsumowanie[1] = runda 2, Wania: „" + sumItems[1].textContent + "”");
  for (const li of sumItems) {
    assert.ok(!/wymuszone|połączenie/i.test(li.textContent),
      "podsumowanie neutralne — bez źródeł: „" + li.textContent + "”");
  }

  // ===== 7) sekret właściciela: 5 szybkich kliknięć w piastę =====
  // 4 kliknięcia to za mało — ustawienia pozostają zamknięte
  for (let i = 0; i < 4; i++) clickWheelCenter();
  assert.ok(d.getElementById("settings-overlay").classList.contains("hidden"),
    "4 kliknięcia w piastę nie otwierają ustawień");
  await wait(2600); // okno sekretu (2,5 s) wygasa

  for (let i = 0; i < 5; i++) clickWheelCenter();
  assert.ok(!d.getElementById("settings-overlay").classList.contains("hidden"),
    "5 kliknięć w piastę otwiera ustawienia (sekret właściciela)");
  const toast = d.getElementById("toast");
  assert.equal(toast.textContent, "Tryb właściciela", "toast: „Tryb właściciela”");
  assert.ok(!toast.classList.contains("hidden"), "toast widoczny");

  // etykiety źródeł widoczne po otwarciu ustawień (tryb właściciela)
  const ownerItems = Array.from(d.querySelectorAll("#history li"));
  assert.ok(ownerItems[0].textContent.includes("połączenie: Sofia → Wania"),
    "runda 2 z etykietą połączenia: „" + ownerItems[0].textContent + "”");
  assert.ok(ownerItems[1].textContent.includes("wymuszone"),
    "runda 1 z etykietą wymuszenia: „" + ownerItems[1].textContent + "”");

  // okno ustawień pokazuje preset
  assert.equal(d.querySelectorAll("#choices-list .row").length, 4, "4 wybory w ustawieniach");
  assert.equal(d.querySelectorAll("#links-list .row").length, 1, "1 połączenie w ustawieniach");
  assert.equal(d.querySelectorAll("#forced-list .row").length, 1, "1 wymuszenie w ustawieniach");

  console.log("SMOKE TEST OK — v1.1: boot/branding, ukryte ustawienia (sekret), Sofia→Wania, neutralna historia + etykiety właściciela.");
  process.exit(0);
})().catch((e) => {
  console.error("SMOKE TEST FAIL:", e && e.message ? e.message : e);
  process.exit(1);
});
