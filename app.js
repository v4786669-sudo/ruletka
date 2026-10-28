/* Fake Roulette v1.0 — interfejs i animacja koła */
(function () {
  "use strict";

  var Core = window.RouletteCore;

  var STORAGE_KEY = "fake-roulette-v1";

  var DEFAULT_CONFIG = {
    choices: ["Sofia", "Wania", "Julia", "Maja", "Zuzia", "Oliwia"],
    links: [{ from: "Sofia", to: "Wania" }],
    rounds: 2,
    forced: []
  };

  var PALETTE = [
    "#e74c3c", "#f39c12", "#27ae60", "#2980b9", "#8e44ad", "#16a085",
    "#d35400", "#e84393", "#c0392b", "#7f8c8d", "#9b59b6", "#1abc9c",
    "#e67e22", "#34495e", "#f1c40f", "#2ecc71"
  ];

  function $(id) { return document.getElementById(id); }

  var canvas = $("wheel");
  var ctx = canvas.getContext("2d");

  var config = loadConfig();
  var game = null;      // { results, index } — sekwencja całej gry ustalana przy starcie
  var spinning = false;
  var angle = 0;        // bieżący kąt obrotu koła (radiany)
  var size = 0;
  var dpr = window.devicePixelRatio || 1;
  var draft = null;     // kopia ustawień edytowana w oknie ustawień

  /* ================= konfiguracja / localStorage ================= */

  function loadConfig() {
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
    var R = size / 2 - 10;
    var n = config.choices.length;

    // złota obręcz
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R + 4, 0, Math.PI * 2);
    ctx.strokeStyle = "#f5c542";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();

    if (n === 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = "#232a38";
      ctx.fill();
      ctx.fillStyle = "#8b93a7";
      ctx.font = "600 15px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Dodaj wybory w ustawieniach", cx, cy);
      ctx.restore();
      return;
    }

    var seg = (Math.PI * 2) / n;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    for (var i = 0; i < n; i++) {
      var a0 = -Math.PI / 2 + i * seg;
      var a1 = a0 + seg;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, a0, a1);
      ctx.closePath();
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.fill();
      ctx.strokeStyle = "#141a24";
      ctx.lineWidth = 2;
      ctx.stroke();

      // etykieta segmentu
      var mid = a0 + seg / 2;
      var lr = R * 0.68;
      ctx.save();
      ctx.rotate(mid + Math.PI / 2);
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 " + Math.max(12, Math.min(17, R * 0.16)) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 3;
      var label = config.choices[i];
      if (label.length > 14) label = label.slice(0, 13) + "…";
      ctx.fillText(label, lr, 0);
      ctx.restore();
    }

    // piasta
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.17, 0, Math.PI * 2);
    ctx.fillStyle = "#141a24";
    ctx.fill();
    ctx.strokeStyle = "#f5c542";
    ctx.lineWidth = 3;
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
      toast("⚠️ Dodaj wybory w ustawieniach");
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
    $("history").innerHTML = "";
    $("result").textContent = "Kręcimy…";
    $("result").className = "result";
    updateRoundInfo();
    spinTo(0);
  }

  function resetGame() {
    if (spinning) return;
    game = null;
    $("history").innerHTML = "";
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
    animateSpin(choiceIndex, function () { onSpinLanded(index); });
  }

  function animateSpin(choiceIndex, done) {
    spinning = true;
    updateButtons();

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

    function frame(now) {
      var t = Math.min(1, (now - t0) / duration);
      var eased = 1 - Math.pow(1 - t, 3.4);
      angle = start + (finalAngle - start) * eased;
      drawWheel();
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
    addHistory(index + 1, res);
    updateRoundInfo();
    updateButtons();
    if (game.index + 1 >= game.rounds) {
      setTimeout(showSummary, 1000);
    }
  }

  function addHistory(roundNo, res) {
    var ul = $("history");
    var li = document.createElement("li");

    var num = document.createElement("span");
    num.className = "h-round";
    num.textContent = "Runda " + roundNo;

    var name = document.createElement("span");
    name.className = "h-name";
    name.textContent = res ? res.name : "?";

    var badge = document.createElement("span");
    badge.className = badgeClass(res);
    badge.textContent = sourceLabel(res);

    li.appendChild(num);
    li.appendChild(name);
    li.appendChild(badge);
    ul.insertBefore(li, ul.firstChild);
  }

  function showSummary() {
    var ol = $("summary-list");
    ol.innerHTML = "";
    for (var i = 0; i < game.results.length; i++) {
      var r = game.results[i];
      var li = document.createElement("li");
      li.textContent = "Runda " + (i + 1) + " — " + (r ? r.name : "?") + " (" + sourceLabel(r) + ")";
      ol.appendChild(li);
    }
    $("summary-overlay").classList.remove("hidden");
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

  /* ================= zdarzenia ================= */

  $("btn-spin").addEventListener("click", onSpinClick);
  $("btn-reset").addEventListener("click", resetGame);
  $("btn-settings").addEventListener("click", openSettings);
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
