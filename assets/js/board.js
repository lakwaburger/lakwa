/* /board/ — the order screen at the cashier. Public: shows numbers only (public.order_board()).
   Columns: Incoming (payment not verified yet) → Preparing → Ready.
   Refreshes every 5 s, chimes when a number turns ready, keeps the screen awake. */
(function () {
  "use strict";
  var $ = L.$, esc = L.esc;
  var inEl = $("[data-in]"), prepEl = $("[data-prep]"), readyEl = $("[data-ready]"), statusEl = $("[data-status]"), clockEl = $("[data-clock]");
  var POLL = 5000, FRESH = 60000;          // a number counts as "just ready" for 60 s
  var seenReady = null, audio = null, wake = null;

  $("[data-order-url]").textContent = location.host + L.base + "/order/";

  function key(i) { return i.kind + ":" + i.no; }
  function size(n) { return n <= 4 ? "xl" : n <= 9 ? "lg" : n <= 16 ? "md" : "sm"; }
  function li(i, cls) {
    return '<li class="board-num ' + (cls || "") + '"><b>' + esc(i.no) + "</b>" +
      (i.kind === "online" ? '<span class="board-tag">Online</span>' : "") + "</li>";
  }

  function render(d) {
    var now = new Date(d.now).getTime(), fresh = [];
    var incoming = d.incoming || [];
    inEl.className = "board-nums board-nums--" + size(incoming.length);
    inEl.innerHTML = incoming.map(function (i) { return li(i); }).join("") || '<li class="board-empty">-</li>';
    prepEl.className = "board-nums board-nums--" + size(d.preparing.length);
    readyEl.className = "board-nums board-nums--" + size(d.ready.length);
    prepEl.innerHTML = d.preparing.map(function (i) { return li(i); }).join("") ||
      '<li class="board-empty">No orders in the kitchen</li>';
    readyEl.innerHTML = d.ready.map(function (i) {
      var isNew = now - new Date(i.at).getTime() < FRESH;
      if (seenReady && !seenReady[key(i)]) fresh.push(i);
      return li(i, isNew ? "is-new" : "");
    }).join("") || '<li class="board-empty">-</li>';
    var next = {};
    d.ready.forEach(function (i) { next[key(i)] = true; });
    if (fresh.length) chime();
    seenReady = next;
  }

  function poll() {
    L.sb.rpc("order_board").then(function (r) {
      if (r.error || !r.data) throw r.error || new Error("no data");
      statusEl.textContent = "";
      render(r.data);
    }).catch(function () {
      statusEl.textContent = "Reconnecting...";
    }).then(function () { setTimeout(poll, POLL); });
  }

  function tick() {
    clockEl.textContent = new Date().toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
  }

  // Two-tone "ding-dong". Browsers only allow sound after someone taps the screen once.
  function chime() {
    if (!audio) return;
    [[880, 0], [660, 0.35]].forEach(function (n) {
      var o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + n[1];
      o.type = "sine"; o.frequency.value = n[0];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(audio.destination);
      o.start(t); o.stop(t + 1);
    });
  }

  function keepAwake() {
    if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
    navigator.wakeLock.request("screen").then(function (w) { wake = w; }).catch(function () {});
  }
  document.addEventListener("visibilitychange", function () { if (!wake || wake.released) keepAwake(); });

  var start = $("[data-start]");
  start.addEventListener("click", function () {
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch (e) {}
    var el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
    keepAwake();
    chime();
    start.hidden = true;
  });

  // Pick up site updates: reload every 6 hours.
  setTimeout(function () { location.reload(); }, 6 * 3600 * 1000);

  tick(); setInterval(tick, 10000);
  keepAwake();
  poll();
})();
