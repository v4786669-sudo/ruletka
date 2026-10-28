/* Ruletka v1.1 — interfejs, animacja koła i tryb właściciela.
 * Koło rysowane na canvasie w stylu ruletki kasynowej (czerwone/czarne
 * segmenty, drewniano-złota obręcz, złota strzałka). Logika gry: core.js.
 * Ustawienia są ukryte przed graczami — właściciel otwiera je sekretem:
 * 5 szybkich kliknięć w piastę koła (okno 2,5 s). Po otwarciu ustawień
 * w sesji (ownerMode) historia i podsumowanie pokazują źródła wyników.
 */
(function () {
  "use strict";

  var Core = window.RouletteCore;

  var STORAGE_KEY = "ruletka-v1";
  var SECRET_WINDOW_MS = 2500;
  var SECRET_CLICKS_NEEDED = 5;

  var DEFAULT_CONFIG = {
    choices: ["Sofia", "Wania", "Julia", "Maja", "Zuzia", "Oliwia"],
    links: [{ from: "Sofia", to: "Wania" }],
    rounds: 2,
    forced: []
  };

  var SEG_COLORS = ["#b71c1c", "#1c1c1c"]; // naprzemiennie czerwone/czarne
  var GOLD = "#d4af37";
  var GOLD_LIGHT = "#f7e3a1";
  var GOLD_DARK = "#8a6d1a";

  function $(id) { return document.getElementById(id); }

  var canvas = $("wheel");
  var ctx = canvas.getContext("2d");

  var config = loadConfig();
  var game = null;      // { results, index, rounds } — sekwencja całej gry ustalana przy starcie
  var spinning = false;
  var angle = 0;        // bieżący kąt obrotu koła (radiany)
  var size = 0;         // rozmiar canvasu w pikselach CSS
  var dpr = window.devicePixelRatio || 1;
  var draft = null;     // kopia ustawień edytowana w oknie ustawień
  var ownerMode = false;      // true po otwarciu ustawień w tej sesji
  var historyEntries = [];    // [{ roundNo, res }] — do przerysowania z etykietami
  var secretClicks = [];      // znaczniki czasu kliknięć w piastę
  var hubRadius = 0;          // promień piasty ustawiany w drawWheel

  /* ================= konfiguracja / localStorage ================= */

  // Migracja klucza starszej wersji: każdy inny klucz, którego nazwa zawiera
  // „roulette” (dawny klucz wersji 1.0), jest przepisywany na nowy klucz i
  // usuwany. Jeśli nowy klucz już istnieje, zostaje (nowsze dane wygrywają).
  function migrateLegacyStorage() {
    try {
      var keys = Object.keys(localStorage);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k !== STORAGE_KEY && String(k).toLowerCase().indexOf("roulette") >= 0) {
          if (localStorage.getItem(STORAGE_KEY) == null) {
            localStorage.setItem(STORAGE_KEY, localStorage.getItem(k));
          }
          localStorage.removeItem(k);
        }
      }
    } catch (e) { /* brak dostępu do localStorage — ignorujemy */ }
  }

  function loadConfig() {
    migrateLegacyStorage();
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (e) { saved = null; }
    var cfg = Core.normalizeConfig({
      choices: (saved && saved.choices) || DEFAULT_CONFIG.choices,
      links: (saved && saved.links) || DEFAULT_CONFIG.links,
      rounds: saved && saved.rounds != null ? saved.rounds : DEFAULT_CONFIG.rounds,
      forced: (saved && saved.forced) || DEFAULT_CONFIG.forced
    });
    if (cfg.choices.length === 0) cfg.choices = DEFAULT_CONFIG.choices.slice();
    return cfg;
  }

  function persistConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        choices: config.choices,
        links: config.links,
        rounds: config.rounds,
        forced: config.forced
      }));
    } catch (e) { /* brak dostępu do localStorage — ignorujemy */ }
  }

  /* ================= narzędzia rysowania ================= */

  function linearGrad(x0, y0, x1, y1, stops) {
    var g = null;
    try { g = ctx.createLinearGradient(x0, y0, x1, y1); } catch (e) { g = null; }
    if (!g || typeof g.addColorStop !== "function") return stops[0][1];
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  }

  function radialGrad(x0, y0, r0, x1, y1, r1, stops) {
    var g = null;
    try { g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1); } catch (e) { g = null; }
    if (!g || typeof g.addColorStop !== "function") return stops[0][1];
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  }

  /* ================= rysowanie koła ================= */

  function resizeCanvas() {
    var wrap = canvas.parentElement;
    var css = Math.min(wrap.clientWidth || 420, 520);
    canvas.style.width = css + "px";
    canvas.style.height = css + "px";
    size = css;
    canvas.width = Math.max(1, Math.round(css * dpr));
    canvas.height = Math.max(1, Math.round(css * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWheel();
  }

  function drawWheel() {
    if (!size) return;
    ctx.clearRect(0, 0, size, size);
    var cx = size / 2;
    var cy = size / 2;
    var rimOuter = size / 2 - 2;
    var rimW = Math.max(12, size * 0.085);
    var rimInner = rimOuter - rimW;
    var wheelR = rimInner - 2;
    var hubR = wheelR * 0.17;
    hubRadius = hubR;
    var n = config.choices.length;

    drawRim(cx, cy, rimOuter, rimInner, n);

    if (n === 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, wheelR, 0, Math.PI * 2);
      ctx.fillStyle = "#161616";
      ctx.fill();
      ctx.fillStyle = "#9aa3b2";
      ctx.font = "600 15px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Brak wyborów na kole", cx, cy);
      ctx.restore();
      drawHub(cx, cy, hubR);
      return;
    }

    var seg = (Math.PI * 2) / n;

    // segmenty + złote separatory (obracane z kołem)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    for (var i = 0; i < n; i++) {
      var a0 = -Math.PI / 2 + i * seg;
      var a1 = a0 + seg;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, wheelR, a0, a1);
      ctx.closePath();
      ctx.fillStyle = SEG_COLORS[i % 2];
      ctx.fill();
    }
    ctx.lineCap = "round";
    for (var s = 0; s < n; s++) {
      var a = -Math.PI / 2 + s * seg;
      var sx1 = Math.cos(a) * (hubR + 2);
      var sy1 = Math.sin(a) * (hubR + 2);
      var sx2 = Math.cos(a) * wheelR;
      var sy2 = Math.sin(a) * wheelR;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.strokeStyle = "rgba(0,0,0,0.42)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();

    // połysk tarczy — statyczny względem ekranu (głębia krawędzi); rysowany
    // przed etykietami, żeby tekst pozostał czytelny.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, wheelR, 0, Math.PI * 2);
    ctx.fillStyle = radialGrad(
      cx - wheelR * 0.35, cy - wheelR * 0.35, wheelR * 0.05,
      cx, cy, wheelR * 1.05,
      [
        [0, "rgba(255,255,255,0.10)"],
        [0.45, "rgba(255,255,255,0.02)"],
        [1, "rgba(0,0,0,0.32)"]
      ]
    );
    ctx.fill();
    ctx.restore();

    drawLabels(cx, cy, wheelR, hubR, seg, n);
    drawHub(cx, cy, hubR);
  }

  // Drewniano-złota obręcz: pierścień drewna z kieszonkami, złote kreski
  // na granicach segmentów i złote piny (rombiki) na rantach. Obręcz jest
  // statyczna — obraca się tylko tarcza w środku.
  function drawRim(cx, cy, rimOuter, rimInner, n) {
    var midR = (rimOuter + rimInner) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rimOuter, 0, Math.PI * 2);
    ctx.arc(cx, cy, rimInner, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fillStyle = linearGrad(cx - rimOuter, cy - rimOuter, cx + rimOuter, cy + rimOuter, [
      [0, "#7c4b25"],
      [0.5, "#5c3817"],
      [1, "#8a5a2e"]
    ]);
    ctx.fill();

    if (n > 0) {
      var seg = (Math.PI * 2) / n;
      for (var i = 0; i < n; i++) {
        var a0 = -Math.PI / 2 + i * seg;
        var a1 = a0 + seg;
        ctx.beginPath();
        ctx.arc(cx, cy, rimOuter, a0, a1);
        ctx.arc(cx, cy, rimInner, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? "rgba(255,235,190,0.07)" : "rgba(0,0,0,0.10)";
        ctx.fill();
      }
      for (var k = 0; k < n; k++) {
        var a = -Math.PI / 2 + k * seg;
        var kx1 = cx + Math.cos(a) * rimInner;
        var ky1 = cy + Math.sin(a) * rimInner;
        var kx2 = cx + Math.cos(a) * rimOuter;
        var ky2 = cy + Math.sin(a) * rimOuter;
        ctx.beginPath();
        ctx.moveTo(kx1, ky1);
        ctx.lineTo(kx2, ky2);
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(kx1, ky1);
        ctx.lineTo(kx2, ky2);
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      var pin = Math.max(3, Math.min(6, size * 0.011));
      for (var p = 0; p < n; p++) {
        var pa = -Math.PI / 2 + p * seg;
        var px = cx + Math.cos(pa) * midR;
        var py = cy + Math.sin(pa) * midR;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(pa + Math.PI / 4);
        ctx.beginPath();
        ctx.rect(-pin / 2, -pin / 2, pin, pin);
        ctx.fillStyle = GOLD_LIGHT;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.beginPath();
    ctx.arc(cx, cy, rimOuter - 1, 0, Math.PI * 2);
    ctx.strokeStyle = GOLD_DARK;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, rimInner + 1, 0, Math.PI * 2);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // Etykiety wzdłuż promienia, od środka na zewnątrz. Rozmiar fontu jest
  // adaptacyjny (ctx.measureText): dopasowany do liczby segmentów i długości
  // nazwy; za długie nazwy dostają wielokropek „…”. Tekst jest obracany o π,
  // gdy środek segmentu wskazuje w lewą połowę koła — dzięki temu nigdy nie
  // jest „do góry nogami”. Tekst mieści się w segmencie i przed krawędzią.
  function drawLabels(cx, cy, wheelR, hubR, seg, n) {
    var minR = hubR + Math.max(5, wheelR * 0.04);
    var maxR = wheelR - 5;
    var room = maxR - minR;
    var lr = (minR + maxR) / 2;
    var halfChord = Math.tan(seg / 2);               // połowa cięciwy segmentu / promień
    var tangRoom = Math.max(9, 2 * minR * halfChord - 8);
    var baseSize = Math.max(9, Math.min(20, tangRoom * 0.66, room * 0.5));

    for (var i = 0; i < n; i++) {
      var m = -Math.PI / 2 + i * seg + seg / 2;
      var wa = ((m + angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      var flip = Math.cos(wa) < 0; // lewa połowa → obróć o π, by tekst nie był do góry nogami
      var fit = fitLabel(config.choices[i], baseSize, room * 0.92);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(wa);
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 " + fit.size + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 2;
      if (flip) {
        ctx.rotate(Math.PI);
        ctx.fillText(fit.text, -lr, 0);
      } else {
        ctx.fillText(fit.text, lr, 0);
      }
      ctx.restore();
    }
  }

  // Szerokość tekstu w px; odporne na środowiska bez prawdziwego canvasu
  // (np. jsdom w testach), gdzie measureText może nie działać.
  function measureTextWidth(text) {
    var m = null;
    try { m = ctx.measureText(text); } catch (e) { m = null; }
    return (m && typeof m.width === "number") ? m.width : 0;
  }

  // Dopasowuje nazwę do dostępnej długości wzdłuż promienia:
  // najpierw zmniejsza font (do minimum 9px), potem skraca tekst z „…”.
  function fitLabel(name, baseSize, maxLen) {
    var size = Math.max(9, Math.round(baseSize));
    var text = name;
    ctx.font = "700 " + size + "px system-ui, sans-serif";
    var w = measureTextWidth(text);
    while (size > 9 && w > maxLen) {
      size -= 1;
      ctx.font = "700 " + size + "px system-ui, sans-serif";
      w = measureTextWidth(text);
    }
    if (w <= maxLen) return { text: text, size: size };
    while (text.length > 1) {
      text = text.slice(0, -1);
      if (measureTextWidth(text + "…") <= maxLen) break;
    }
    return { text: text + "…", size: size };
  }

  // Piasta: ciemny środek, złoty pierścień, ozdobne nity i środkowy guzik.
  function drawHub(cx, cy, hubR) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(0, 0, hubR, 0, Math.PI * 2);
    ctx.fillStyle = radialGrad(0, 0, hubR * 0.1, 0, 0, hubR, [
      [0, "#3d3d3d"],
      [0.7, "#1c1c1c"],
      [1, "#0d0d0d"]
    ]);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, hubR * 0.94, 0, Math.PI * 2);
    ctx.strokeStyle = linearGrad(-hubR, -hubR, hubR, hubR, [
      [0, GOLD_DARK],
      [0.5, GOLD_LIGHT],
      [1, GOLD_DARK]
    ]);
    ctx.lineWidth = Math.max(2, hubR * 0.22);
    ctx.stroke();
    var nuts = 8;
    var nr = hubR * 0.62;
    var nrs = Math.max(1.2, hubR * 0.09);
    for (var i = 0; i < nuts; i++) {
      var a = (Math.PI * 2) * i / nuts;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * nr, Math.sin(a) * nr, nrs, 0, Math.PI * 2);
      ctx.fillStyle = GOLD_LIGHT;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, hubR * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = GOLD;
    ctx.fill();
    ctx.strokeStyle = GOLD_DARK;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  /* ================= przebieg gry ================= */

  function sourceLabel(res) {
    if (!res) return "losowo";
    if (res.source === "forced") return "wymuszone";
    if (res.source === "link") return "połączenie: " + res.link.from + " → " + res.link.to;
    return "losowo";
  }

  function badgeClass(res) {
    return "badge badge-" + (res ? res.source : "random");
  }

  function updateButtons() {
    var btn = $("btn-spin");
    btn.disabled = spinning || config.choices.length === 0;
    if (game == null) {
      btn.textContent = "🎡 Rozpocznij grę" + (config.rounds === 1 ? "" : " (" + config.rounds + " rund)");
    } else if (game.index + 1 >= game.rounds) {
      btn.textContent = "🎡 Nowa gra";
    } else {
      btn.textContent = "🎡 Zakręć (runda " + (game.index + 2) + "/" + game.rounds + ")";
    }
  }

  function updateRoundInfo() {
    var el = $("round-info");
    if (game && game.index >= 0) {
      el.textContent = "Runda " + (game.index + 1) + " z " + game.rounds;
    } else {
      el.textContent = "";
    }
  }

  function onSpinClick() {
    if (spinning) return;
    if (config.choices.length === 0) {
      toast("⚠️ Koło nie ma wyborów");
      return;
    }
    if (game == null || game.index + 1 >= game.rounds) {
      startNewGame();
      return;
    }
    spinTo(game.index + 1);
  }

  function startNewGame() {
    var res = Core.runGame(config, Math.random);
    game = { results: res.results, index: -1, rounds: res.rounds };
    historyEntries = [];
    renderHistory();
    $("result").textContent = "Kręcimy…";
    $("result").className = "result";
    updateRoundInfo();
    spinTo(0);
  }

  function resetGame() {
    if (spinning) return;
    game = null;
    historyEntries = [];
    renderHistory();
    $("result").textContent = "Naciśnij „Rozpocznij grę”, aby zakręcić";
    $("result").className = "result";
    updateRoundInfo();
    updateButtons();
  }

  function spinTo(index) {
    if (spinning || !game) return;
    var res = game.results[index];
    if (!res) { onSpinLanded(index); return; }
    var choiceIndex = config.choices.indexOf(res.name);
    if (choiceIndex < 0) choiceIndex = 0;
    $("result").textContent = "Kręcimy…";
    $("result").className = "result";
    animateSpin(choiceIndex, function () { onSpinLanded(index); });
  }

  var TICK_TIMES = [0, 60, 130, 210, 300, 400, 510, 640, 790, 960, 1160, 1390, 1660, 1970, 2330];

  function animateSpin(choiceIndex, done) {
    spinning = true;
    updateButtons();
    ensureAudio();

    var n = config.choices.length;
    var seg = (Math.PI * 2) / n;
    var rnd = Math.random();
    // wskaźnik ma trafić w środek segmentu + drobny losowy rozrzut (wygląda naturalnie)
    var targetPointer = choiceIndex * seg + seg / 2 + (rnd - 0.5) * seg * 0.55;

    var targetMod = (((-Math.PI / 2 - targetPointer) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    var baseMod = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    var delta = (targetMod - baseMod + Math.PI * 2) % (Math.PI * 2);
    var turns = (5 + Math.random() * 4) * Math.PI * 2; // 5–9 pełnych obrotów
    var finalAngle = angle + delta + turns;

    var start = angle;
    var duration = 4200;
    var t0 = performance.now();
    var tickIdx = 0;

    function frame(now) {
      var t = Math.min(1, (now - t0) / duration);
      var eased = 1 - Math.pow(1 - t, 3.4);
      angle = start + (finalAngle - start) * eased;
      drawWheel();
      while (tickIdx < TICK_TIMES.length && now - t0 >= TICK_TIMES[tickIdx]) {
        soundTick();
        tickIdx++;
      }
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        angle = finalAngle;
        drawWheel();
        spinning = false;
        done();
      }
    }
    requestAnimationFrame(frame);
  }

  function onSpinLanded(index) {
    var res = game.results[index];
    var name = res ? res.name : "?";
    var el = $("result");
    el.textContent = "Wypadło: " + name;
    el.className = "result win";
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
    game.index = index;
    historyEntries.push({ roundNo: index + 1, res: res });
    renderHistory();
    soundDing();
    updateRoundInfo();
    updateButtons();
    if (game.index + 1 >= game.rounds) {
      setTimeout(showSummary, 1000);
    }
  }

  // Historia rund: domyślnie tylko „Runda N — Imię”; etykiety źródeł
  // (wymuszone/połączenie) są widoczne wyłącznie w trybie właściciela.
  function buildHistoryItem(roundNo, res) {
    var li = document.createElement("li");
    var num = document.createElement("span");
    num.className = "h-round";
    num.textContent = "Runda " + roundNo + " —";
    var name = document.createElement("span");
    name.className = "h-name";
    name.textContent = res ? res.name : "?";
    li.appendChild(num);
    li.appendChild(name);
    if (ownerMode) {
      var badge = document.createElement("span");
      badge.className = badgeClass(res);
      badge.textContent = sourceLabel(res);
      li.appendChild(badge);
    }
    return li;
  }

  function renderHistory() {
    var ul = $("history");
    ul.innerHTML = "";
    for (var i = historyEntries.length - 1; i >= 0; i--) {
      ul.appendChild(buildHistoryItem(historyEntries[i].roundNo, historyEntries[i].res));
    }
  }

  // Podsumowanie: domyślnie lista wyników; źródła widoczne w trybie właściciela.
  function showSummary() {
    var ol = $("summary-list");
    ol.innerHTML = "";
    for (var i = 0; i < game.results.length; i++) {
      var r = game.results[i];
      var li = document.createElement("li");
      li.textContent = "Runda " + (i + 1) + " — " + (r ? r.name : "?") +
        (ownerMode ? " (" + sourceLabel(r) + ")" : "");
      ol.appendChild(li);
    }
    $("summary-overlay").classList.remove("hidden");
  }

  /* ================= dźwięk (WebAudio, bez plików) ================= */

  var audioCtx = null;

  // Kontekst audio tworzymy dopiero przy pierwszym geście użytkownika
  // (przeglądarki blokują autoodtwarzanie).
  function ensureAudio() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === "suspended" && typeof audioCtx.resume === "function") {
        audioCtx.resume();
      }
    } catch (e) { audioCtx = null; }
  }

  function beep(freq, duration, type, volume, delay) {
    if (!audioCtx) return;
    try {
      var t0 = audioCtx.currentTime + (delay || 0);
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(volume || 0.05, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.05);
    } catch (e) { /* ignorujemy problemy z dźwiękiem */ }
  }

  function soundTick() { beep(1500, 0.035, "square", 0.02); }

  function soundDing() {
    beep(880, 0.4, "sine", 0.08);
    beep(1318.51, 0.55, "sine", 0.06, 0.1);
  }

  /* ================= okno ustawień ================= */

  function openSettings() {
    draft = {
      choices: config.choices.slice(),
      links: config.links.map(function (l) { return { from: l.from, to: l.to }; }),
      rounds: config.rounds,
      forced: config.forced.slice()
    };
    renderSettings();
    $("settings-overlay").classList.remove("hidden");
  }

  function closeSettings() {
    $("settings-overlay").classList.add("hidden");
    draft = null;
  }

  function renderSettings() {
    renderChoices();
    renderLinks();
    renderForced();
    $("input-rounds").value = draft.rounds;
  }

  function renderChoices() {
    var box = $("choices-list");
    box.innerHTML = "";
    draft.choices.forEach(function (name, i) {
      var row = document.createElement("div");
      row.className = "row";

      var input = document.createElement("input");
      input.type = "text";
      input.maxLength = 24;
      input.value = name;
      input.addEventListener("input", function () {
        draft.choices[i] = this.value;
      });

      var del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-small";
      del.textContent = "✕";
      del.title = "Usuń wybór";
      del.addEventListener("click", function () {
        var removed = draft.choices[i];
        draft.choices.splice(i, 1);
        draft.links = draft.links.filter(function (l) { return l.from !== removed && l.to !== removed; });
        draft.forced = draft.forced.map(function (f) { return f === removed ? null : f; });
        renderSettings();
      });

      row.appendChild(input);
      row.appendChild(del);
      box.appendChild(row);
    });
  }

  function makeSelect(options, value, onChange) {
    var sel = document.createElement("select");
    var vals = options.slice();
    if (value && vals.indexOf(value) < 0) vals.push(value);
    vals.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    });
    sel.value = value;
    sel.addEventListener("change", function () { onChange(sel.value); });
    return sel;
  }

  function renderLinks() {
    var box = $("links-list");
    box.innerHTML = "";
    if (draft.links.length === 0) {
      var empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = "Brak połączeń. Połączenie działa tak: gdy wypadnie A, następna runda na pewno wylosuje B.";
      box.appendChild(empty);
    }
    draft.links.forEach(function (link, i) {
      var row = document.createElement("div");
      row.className = "row";
      row.appendChild(makeSelect(draft.choices, link.from, function (v) { draft.links[i].from = v; }));
      var arrow = document.createElement("span");
      arrow.className = "arrow";
      arrow.textContent = "→";
      row.appendChild(arrow);
      row.appendChild(makeSelect(draft.choices, link.to, function (v) { draft.links[i].to = v; }));
      var del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-small";
      del.textContent = "✕";
      del.title = "Usuń połączenie";
      del.addEventListener("click", function () {
        draft.links.splice(i, 1);
        renderSettings();
      });
      row.appendChild(del);
      box.appendChild(row);
    });
  }

  function renderForced() {
    var box = $("forced-list");
    box.innerHTML = "";
    if (draft.forced.length === 0) {
      var empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = "Brak wymuszeń — wszystkie rundy losują się naturalnie (z uwzględnieniem połączeń).";
      box.appendChild(empty);
    }
    draft.forced.forEach(function (name, i) {
      var row = document.createElement("div");
      row.className = "row";
      var tag = document.createElement("span");
      tag.className = "forced-round";
      tag.textContent = "Runda " + (i + 1) + ":";
      row.appendChild(tag);
      row.appendChild(makeSelect(draft.choices, name, function (v) { draft.forced[i] = v; }));
      var del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-small";
      del.textContent = "✕";
      del.title = "Usuń wymuszenie";
      del.addEventListener("click", function () {
        draft.forced.splice(i, 1);
        renderSettings();
      });
      row.appendChild(del);
      box.appendChild(row);
    });
  }

  function saveSettings() {
    var cfg = Core.normalizeConfig({
      choices: draft.choices,
      links: draft.links,
      rounds: draft.rounds,
      forced: draft.forced
    });
    if (cfg.choices.length === 0) {
      toast("⚠️ Dodaj co najmniej jeden wybór");
      return;
    }
    if (cfg.choices.length === 1) {
      toast("⚠️ Koło potrzebuje co najmniej 2 wyborów, aby się kręcić");
      return;
    }
    config = cfg;
    persistConfig();
    closeSettings();
    resetGame();
    drawWheel();
    toast("✅ Ustawienia zapisane");
  }

  /* ================= toast ================= */

  var toastTimer = null;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add("hidden"); }, 2600);
  }

  /* ================= sekret: 5 kliknięć w piastę ================= */

  // Detekcja przez getBoundingClientRect + clientX/clientY (nie offsetX/Y —
  // testy symulują kliknięcia właśnie przez clientX/clientY, a w jsdom
  // getBoundingClientRect zwraca 0). Liczy się odległość od środka koła:
  // musi być ≤ promień piasty * 1,6. 5 kliknięć w oknie 2,5 s otwiera
  // ustawienia i włącza tryb właściciela.
  canvas.addEventListener("click", function (e) {
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var cx = size / 2;
    var cy = size / 2;
    var zone = (hubRadius || size * 0.15) * 1.6;
    var dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
    if (dist > zone) return;
    var now = Date.now();
    secretClicks.push(now);
    while (secretClicks.length > 0 && now - secretClicks[0] > SECRET_WINDOW_MS) {
      secretClicks.shift();
    }
    if (secretClicks.length >= SECRET_CLICKS_NEEDED) {
      secretClicks.length = 0;
      ownerMode = true;
      renderHistory();
      openSettings();
      toast("Tryb właściciela");
    }
  });

  /* ================= zdarzenia ================= */

  document.addEventListener("pointerdown", ensureAudio);
  document.addEventListener("keydown", ensureAudio);

  $("btn-spin").addEventListener("click", onSpinClick);
  $("btn-reset").addEventListener("click", resetGame);
  $("btn-close-settings").addEventListener("click", closeSettings);
  $("btn-save-settings").addEventListener("click", saveSettings);

  $("btn-restore-defaults").addEventListener("click", function () {
    draft = {
      choices: DEFAULT_CONFIG.choices.slice(),
      links: DEFAULT_CONFIG.links.map(function (l) { return { from: l.from, to: l.to }; }),
      rounds: DEFAULT_CONFIG.rounds,
      forced: []
    };
    renderSettings();
    toast("Przywrócono domyślne — kliknij „Zapisz”");
  });

  $("btn-add-choice").addEventListener("click", function () {
    draft.choices.push("Wybór " + (draft.choices.length + 1));
    renderSettings();
  });

  $("btn-add-link").addEventListener("click", function () {
    if (draft.choices.length < 2) {
      toast("⚠️ Do połączenia potrzebne są co najmniej 2 wybory");
      return;
    }
    var from = draft.choices[0];
    var to = draft.choices[1] || draft.choices[0];
    draft.links.push({ from: from, to: to });
    renderSettings();
  });

  $("btn-add-forced").addEventListener("click", function () {
    if (draft.choices.length === 0) {
      toast("⚠️ Najpierw dodaj wybory");
      return;
    }
    draft.forced.push(draft.choices[0]);
    renderSettings();
  });

  $("btn-rounds-minus").addEventListener("click", function () {
    draft.rounds = Math.max(1, draft.rounds - 1);
    $("input-rounds").value = draft.rounds;
  });

  $("btn-rounds-plus").addEventListener("click", function () {
    draft.rounds = Math.min(30, draft.rounds + 1);
    $("input-rounds").value = draft.rounds;
  });

  $("input-rounds").addEventListener("input", function () {
    var v = parseInt(this.value, 10);
    if (!isNaN(v)) draft.rounds = Math.min(30, Math.max(1, v));
  });

  $("btn-summary-close").addEventListener("click", function () {
    $("summary-overlay").classList.add("hidden");
    resetGame();
  });

  $("settings-overlay").addEventListener("click", function (e) {
    if (e.target === this) closeSettings();
  });

  $("summary-overlay").addEventListener("click", function (e) {
    if (e.target === this) {
      this.classList.add("hidden");
      resetGame();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      $("summary-overlay").classList.add("hidden");
      closeSettings();
    }
  });

  window.addEventListener("resize", resizeCanvas);

  resizeCanvas();
  updateButtons();
})();
