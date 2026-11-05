/* Lakwa Burger Cafe — shared helpers. Loaded on every page. */
(function () {
  "use strict";
  var C = window.LAKWA_CONFIG || {};
  var sb = window.supabase && C.supabaseUrl ? window.supabase.createClient(C.supabaseUrl, C.supabaseKey) : null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function peso(n) {
    if (n == null || isNaN(n)) return "";
    n = Number(n);
    return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }
  // Same rules as the database (public.public_price / public.member_price).
  function publicPrice(base, markup) { return Math.ceil(Math.round(base * (1 + markup / 100) * 100) / 100); }
  function memberPrice(base, extra) { return Math.round(base * (1 - (extra || 0) / 100)); }
  function sized(url, w) {
    if (!url) return "";
    return /squarespace-cdn\.com/.test(url) && !/format=/.test(url) ? url + "?format=" + w + "w" : url;
  }
  function when(ts, opts) {
    return new Date(ts).toLocaleString("en-PH", Object.assign({ timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }, opts || {}));
  }
  var FUL = { dine_in: "Dine in", pickup: "Pick up", ride_thru: "Ride thru" };
  var STATUS = {
    awaiting_payment: "Awaiting payment", payment_submitted: "Payment submitted", paid: "Paid",
    preparing: "Preparing", ready: "Ready", completed: "Completed", cancelled: "Cancelled"
  };
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function show(el, on) { if (el) el.hidden = !on; }
  function msg(el, text) { if (!el) return; el.textContent = text || ""; el.hidden = !text; }

  // Mobile menu overlay
  var burger = $("[data-burger]"), overlay = $("[data-overlay]");
  if (burger && overlay) {
    var toggle = function (open) {
      burger.classList.toggle("is-open", open);
      overlay.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", open);
      overlay.setAttribute("aria-hidden", !open);
      document.body.style.overflow = open ? "hidden" : "";
    };
    burger.addEventListener("click", function () { toggle(!overlay.classList.contains("is-open")); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") toggle(false); });
    $$("a", overlay).forEach(function (a) { a.addEventListener("click", function () { toggle(false); }); });
  }
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  // Photo viewer: click a menu photo (homepage cards, order page) to see it bigger. Esc / click closes.
  var box = null, lastFocus = null;
  function closeZoom() {
    if (!box || box.hidden) return;
    box.hidden = true; document.body.classList.remove("zoom-open");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function openZoom(src, caption, from) {
    if (!box) {
      box = document.createElement("div");
      box.className = "zoom"; box.hidden = true;
      box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "Photo");
      box.innerHTML = '<button type="button" class="zoom-close" aria-label="Close photo">&times;</button>' +
        '<figure class="zoom-fig"><img alt=""><figcaption></figcaption></figure>';
      box.addEventListener("click", function (e) { if (!e.target.closest(".zoom-fig img")) closeZoom(); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeZoom(); });
      document.body.appendChild(box);
    }
    lastFocus = from;
    var img = box.querySelector("img");
    img.src = src; img.alt = caption || "";
    box.querySelector("figcaption").textContent = caption || "";
    box.hidden = false; document.body.classList.add("zoom-open");
    box.querySelector(".zoom-close").focus();
  }
  document.addEventListener("click", function (e) {
    var img = e.target.closest(".menu-card-img img, .order-item-img img");
    if (!img) return;
    var card = img.closest(".menu-card, .order-item");
    var name = card && card.querySelector("h3") ? card.querySelector("h3").textContent : img.alt;
    openZoom(img.currentSrc || img.src, name, img);
  });

  window.L = {
    C: C, sb: sb, esc: esc, peso: peso, publicPrice: publicPrice, memberPrice: memberPrice, sized: sized,
    when: when, FUL: FUL, STATUS: STATUS, $: $, $$: $$, show: show, msg: msg, base: C.base || ""
  };
})();
