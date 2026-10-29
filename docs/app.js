/* Ruletka v1.2 — interfejs, animacja koła i ustawienia.
 * Koło rysowane na canvasie w stylu ruletki kasynowej (czerwone/czarne
 * segmenty, drewniano-złota obręcz, złota strzałka). Logika gry: core.js.
 * Ustawienia otwiera przycisk „⚙️” w prawym górnym rogu. Kliknięcie
 * „Start” odgrywa automatycznie całą sekwencję rund (kolejność = pary
 * z ustawień): animacja ~4,2 s → „Wypadło: X” + ding → pauza ~1,4 s →
 * następna runda… Po końcu sekwencji Start jest znów aktywny.
 */
(function () {
  "use strict";

  var Core = window.RouletteCore;

  var STORAGE_KEY = "ruletka-v2";
  var LEGACY_KEY = "ruletka-v1";
  var PAUSE_MS = 1400;

  var DEFAULT_CONFIG = {
    choices: ["Wania", "Sofia", "Lena", "Mateusz", "Julia", "Maja"],
    pairs: [{ a: "Wania", b: "Sofia" }]
  };

  var SEG_COLORS = ["#b71c1c", "#1c1c1c"]; // naprzemiennie czerwone/czarne
  var GOLD = "#d4af37";
  var GOLD_LIGHT = "#f7e3a1";
  var GOLD_DARK = "#8a6d1a";

  function $(id) { return document.getElementById(id); }

  var canvas = $("wheel");
  var ctx = canvas.getContext("2d");

  var config = loadConfig();
  var game = null;      // { results: [{name, source}], index, rounds }
  var spinning = false; // koło w ruchu (jedna animacja)
  var playing = false;  // cała sekwencja rund w toku (łącznie z pauzami)
  var angle = 0;        // bieżący kąt obrotu koła (radiany)
  var size = 0;         // rozmiar canvasu w pikselach CSS
  var dpr = window.devicePixelRatio || 1;
  var draft = null;     // kopia ustawień edytowana w oknie ustawień
  var runId = 0;        // token przebiegu — unieważnia stare callbacki/pauzy
  var pauseTimer = null;

  /* ================= konfiguracja / localStorage ================= */

  // Migracja starszych wersji: klucz v1.1 (i ewentualne starsze) są
  // przepisywane na „ruletka-v2” — wybory bierzemy, połączenia zamieniamy
  // na pary (puste pomijamy), resztę ignorujemy — a stary klucz usuwamy.
  // Jeśli nowy klucz już istnieje, zostaje (nowsze dane wygrywają).
  function migrateLegacyStorage() {
    try {
      var keys = Object.keys(localStorage);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k === STORAGE_KEY) continue;
        var isLegacy = k === LEGACY_KEY || String(k).toLowerCase().indexOf("roulette") >= 0;
        if (!isLegacy) continue;
        if (localStorage.getItem(STORAGE_KEY) == null) {
          var old = null;
          try { old = JSON.parse(localStorage.getItem(k)); } catch (e) { old = null; }
          var pairs = [];
          if (old && Array.isArray(old.links)) {
            for (var j = 0; j < old.links.length; j++) {
              var l = old.links[j];
              if (!l || typeof l !== "object") continue;
              var a = String(l.from == null ? "" : l.from).trim();
              var b = String(l.to == null ? "" : l.to).trim();
              if (!a || !b) continue;
              pairs.push({ a: a, b: b });
            }
          }
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            choices: (old && Array.isArray(old.choices)) ? old.choices : [],
            pairs: pairs
          }));
        }
        localStorage.removeItem(k);
      }
    } catch (e) { /* brak dostępu do localStorage — ignorujemy */ }
  }

  function loadConfig() {
    migrateLegacyStorage();
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (e) { saved = null; }
    var cfg = Core.normalizeConfig({
      choices: (saved && saved.choices) || DEFAULT_CONFIG.choices,
      pairs: (saved && saved.pairs) || DEFAULT_CONFIG.pairs
    });
    if (cfg.choices.length === 0) cfg.choices = DEFAULT_CONFIG.choices.slice();
    return cfg;
  }

  function persistConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        choices: config.choices,
        pairs: config.pairs
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

  function updateButtons() {
    var btn = $("btn-spin");
    btn.disabled = playing || spinning || config.choices.length === 0;
    // tekst przycisku zawsze „🎡 Start”
  }

  function updateRoundInfo() {
    var el = $("round-info");
    if (game) {
      el.textContent = "Runda " + Math.max(1, game.index + 1) + " z " + game.rounds;
    } else {
      el.textContent = "";
    }
  }

  function setResult(text, win) {
    var el = $("result");
    el.textContent = text;
    el.className = "result" + (win ? " win" : "");
    if (win) {
      el.classList.remove("pop");
      void el.offsetWidth;
      el.classList.add("pop");
    }
  }

  function onSpinClick() {
    if (playing || spinning) return; // chroni przed podwójnym startem
    if (config.choices.length === 0) {
      toast("⚠️ Koło nie ma wyborów");
      return;
    }
    startGame();
  }

  function startGame() {
    runId++;
    var id = runId;
    clearTimeout(pauseTimer);
    var seq = Core.buildSequence(config, Math.random);
    game = { results: seq, index: -1, rounds: seq.length };
    playing = true;
    setResult("Kręcimy…", false);
    updateRoundInfo();
    updateButtons();
    playNext(id);
  }

  // Odgrywa kolejną rundę sekwencji albo kończy grę.
  function playNext(id) {
    if (id !== runId || !playing || !game) return;
    var next = game.index + 1;
    if (next >= game.rounds) {
      finishGame();
      return;
    }
    spinTo(next, id);
  }

  function spinTo(index, id) {
    if (id !== runId || spinning || !game) return;
    var res = game.results[index];
    if (!res) { onSpinLanded(index, id); return; }
    var choiceIndex = config.choices.indexOf(res.name);
    if (choiceIndex < 0) choiceIndex = 0;
    setResult("Kręcimy…", false);
    animateSpin(choiceIndex, function () { onSpinLanded(index, id); });
  }

  var TICK_TIMES = [0, 60, 130, 210, 300, 400, 510, 640, 790, 960, 1160, 1390, 1660, 1970, 2330];

  function animateSpin(choiceIndex, done) {
    spinning = true;
    updateButtons();
    ensureAudio();

    // Kąt docelowy liczony w core.js (jedno źródło prawdy geometrii
    // lądowania): wskaźnik trafia w środek segmentu celu + drobny jitter,
    // więc koło graficznie ląduje DOKŁADNIE na wybranym polu.
    var finalAngle = Core.targetAngleForSpin(choiceIndex, config.choices.length, angle, Math.random);

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
        updateButtons();
        done();
      }
    }
    requestAnimationFrame(frame);
  }

  function onSpinLanded(index, id) {
    if (id !== runId || !game) return;
    var res = game.results[index];
    var name = res && res.name ? res.name : "?";
    setResult("Wypadło: " + name, true);
    game.index = index;
    soundDing();
    updateRoundInfo();
    if (index + 1 < game.rounds) {
      pauseTimer = setTimeout(function () { playNext(id); }, PAUSE_MS);
    } else {
      finishGame();
    }
    updateButtons();
  }

  function finishGame() {
    playing = false;
    updateButtons();
    // wynik ostatniej rundy zostaje na ekranie; Start jest znów aktywny
  }

  // Zatrzymuje przebieg (używane przy zapisie nowych ustawień).
  function resetPlayState() {
    runId++;
    clearTimeout(pauseTimer);
    playing = false;
    game = null;
    setResult("Naciśnij „Start”, aby zakręcić", false);
    updateRoundInfo();
    updateButtons();
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
      pairs: config.pairs.map(function (p) { return { a: p.a, b: p.b }; })
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
    renderPairs();
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
        draft.pairs = draft.pairs.filter(function (p) { return p.a !== removed && p.b !== removed; });
        renderSettings();
      });

      row.appendChild(input);
      row.appendChild(del);
      box.appendChild(row);
    });
  }

  // Select z bezpieczną obsługą null i pustej listy opcji.
  function makeSelect(options, value, onChange) {
    var sel = document.createElement("select");
    var v = value == null ? "" : String(value);
    var vals = options.slice();
    if (v && vals.indexOf(v) < 0) vals.push(v);
    if (vals.length === 0) vals.push("");
    vals.forEach(function (x) {
      var opt = document.createElement("option");
      opt.value = x;
      opt.textContent = x === "" ? "—" : x;
      sel.appendChild(opt);
    });
    sel.value = v;
    sel.addEventListener("change", function () { onChange(sel.value); });
    return sel;
  }

  function renderPairs() {
    var box = $("pairs-list");
    box.innerHTML = "";
    if (draft.pairs.length === 0) {
      var empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = "Brak rund. Kliknij „+ Dodaj rundę”, aby ułożyć kolejność obrotów.";
      box.appendChild(empty);
    }
    draft.pairs.forEach(function (pair, i) {
      var row = document.createElement("div");
      row.className = "row";
      row.appendChild(makeSelect(draft.choices, pair.a, function (v) { draft.pairs[i].a = v; }));
      var arrow = document.createElement("span");
      arrow.className = "arrow";
      arrow.textContent = "→";
      row.appendChild(arrow);
      row.appendChild(makeSelect(draft.choices, pair.b, function (v) { draft.pairs[i].b = v; }));

      var up = document.createElement("button");
      up.type = "button";
      up.className = "btn btn-small";
      up.textContent = "↑";
      up.title = "Przesuń w górę";
      up.disabled = i === 0;
      up.addEventListener("click", function () {
        var p = draft.pairs.splice(i, 1)[0];
        draft.pairs.splice(i - 1, 0, p);
        renderSettings();
      });

      var down = document.createElement("button");
      down.type = "button";
      down.className = "btn btn-small";
      down.textContent = "↓";
      down.title = "Przesuń w dół";
      down.disabled = i === draft.pairs.length - 1;
      down.addEventListener("click", function () {
        var p = draft.pairs.splice(i, 1)[0];
        draft.pairs.splice(i + 1, 0, p);
        renderSettings();
      });

      var del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-small";
      del.textContent = "✕";
      del.title = "Usuń rundę";
      del.addEventListener("click", function () {
        draft.pairs.splice(i, 1);
        renderSettings();
      });

      row.appendChild(up);
      row.appendChild(down);
      row.appendChild(del);
      box.appendChild(row);
    });
  }

  function saveSettings() {
    var cfg = Core.normalizeConfig({
      choices: draft.choices,
      pairs: draft.pairs
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
    resetPlayState();
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

  /* ================= zdarzenia ================= */

  document.addEventListener("pointerdown", ensureAudio);
  document.addEventListener("keydown", ensureAudio);

  $("btn-spin").addEventListener("click", onSpinClick);
  $("btn-settings").addEventListener("click", openSettings);
  $("btn-close-settings").addEventListener("click", closeSettings);
  $("btn-save-settings").addEventListener("click", saveSettings);

  $("btn-restore-defaults").addEventListener("click", function () {
    draft = {
      choices: DEFAULT_CONFIG.choices.slice(),
      pairs: DEFAULT_CONFIG.pairs.map(function (p) { return { a: p.a, b: p.b }; })
    };
    renderSettings();
    toast("Przywrócono domyślne — kliknij „Zapisz”");
  });

  $("btn-add-choice").addEventListener("click", function () {
    draft.choices.push("Wybór " + (draft.choices.length + 1));
    renderSettings();
  });

  $("btn-add-pair").addEventListener("click", function () {
    if (draft.choices.length < 2) {
      toast("⚠️ Do rundy potrzebne są co najmniej 2 wybory");
      return;
    }
    draft.pairs.push({ a: draft.choices[0], b: draft.choices[1] });
    renderSettings();
  });

  $("settings-overlay").addEventListener("click", function (e) {
    if (e.target === this) closeSettings();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeSettings();
  });

  window.addEventListener("resize", resizeCanvas);

  resizeCanvas();
  updateButtons();
})();
