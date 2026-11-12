/* /staff/ — staff dashboard (Supabase Auth email + password).
   Views (hash routes): #today, #orders, #order=<id>, #board, #payments, #customers, #menu, #settings
   Also: Online orders OPEN/CLOSED switch in the top bar, chime + badge for new orders / payments. */
(function () {
  "use strict";
  var sb = L.sb, esc = L.esc, peso = L.peso, $ = L.$, $$ = L.$$;
  var view = $("[data-view]");
  var me = null;
  var ACTIVE = ["payment_submitted", "paid", "preparing", "ready"];
  var TABS = [["active", "Active"], ["payment_submitted", "Check payment"], ["awaiting_payment", "Awaiting payment"], ["paid", "Paid"],
    ["preparing", "Preparing"], ["ready", "Ready"], ["completed", "Completed"], ["cancelled", "Cancelled"], ["all", "All / history"]];
  var NEXT = {
    awaiting_payment: [["preparing", "Mark paid & start preparing"], ["cancelled", "Cancel order"]],
    payment_submitted: [["cancelled", "Cancel order"]],
    paid: [["preparing", "Start preparing"], ["cancelled", "Cancel order"]],
    preparing: [["ready", "Mark ready"]], ready: [["completed", "Complete"]], completed: [],
    cancelled: [["awaiting_payment", "Re-open"]]
  };
  var filters = { status: "active", q: "", from: "", to: "" };

  // ------------------------------------------------------------ auth
  function boot() {
    sb.auth.getSession().then(function (r) {
      if (!r.data.session) return showLogin();
      sb.from("staff").select("user_id, full_name, role").eq("user_id", r.data.session.user.id).maybeSingle().then(function (s) {
        if (!s.data) { sb.auth.signOut(); return showLogin("This account isn't set up as staff yet."); }
        me = s.data; me.email = r.data.session.user.email;
        L.show($("[data-login]"), false); L.show($("[data-app]"), true);
        $("[data-who]").textContent = me.full_name || me.email;
        $$("[data-admin]").forEach(function (a) { a.hidden = me.role !== "admin"; });
        refreshStore();
        if (!watching) { watching = true; watchNew(); }
        route();
      });
    });
  }
  function showLogin(text) {
    L.show($("[data-app]"), false); L.show($("[data-login]"), true);
    L.msg($("[data-login] [data-error]"), text || "");
  }
  $("[data-login-form]").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, btn = $("button", f);
    btn.disabled = true; btn.textContent = "Signing in...";
    sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value }).then(function (r) {
      btn.disabled = false; btn.textContent = "Sign in";
      if (r.error) return L.msg($("[data-error]", f), "Wrong email or password.");
      f.password.value = ""; boot();
    });
  });
  $("[data-signout]").addEventListener("click", function () { sb.auth.signOut().then(function () { showLogin(); }); });

  // ------------------------------------------------------------ routing
  window.addEventListener("hashchange", function () { if (me) route(); });
  function route() {
    var h = location.hash.slice(1) || "orders";
    $$("[data-staff-nav] a").forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + h.split("=")[0]); });
    refreshBadge();
    window.scrollTo(0, 0);
    if (h.indexOf("order=") === 0) return orderDetail(h.slice(6));
    clearTimeout(boardTimer);
    if (h === "board") return boardView();
    if (h === "today") return today();
    if (h.indexOf("payments") === 0) return payments();
    if (h === "community" || h === "customers") return customers();
    if (h === "menu" && me.role === "admin") return menu();
    if (h === "settings" && me.role === "admin") return settings();
    return orders();
  }
  function refreshBadge() {
    sb.from("membership_requests").select("id", { count: "exact", head: true }).eq("status", "pending").then(function (r) {
      var b = $("[data-req-badge]"); if (!b) return;
      b.textContent = r.count || ""; b.hidden = !r.count;
    });
  }
  function loading() { view.innerHTML = '<p class="muted">Loading...</p>'; }
  function fail(e) { view.innerHTML = '<div class="notice notice--warn">' + esc(e && e.message || "Something went wrong.") + "</div>"; }
  function pill(s) { return '<span class="pill pill--' + s + '">' + (L.STATUS[s] || s) + "</span>"; }
  function clean(q) { return String(q || "").replace(/[,()%*]/g, " ").trim(); }

  // ------------------------------------------------------------ Online orders OPEN / CLOSED (top bar)
  var storeBtn = $("[data-store]");
  function refreshStore() {
    sb.from("settings").select("accepting_orders").eq("id", 1).single().then(function (r) {
      if (!r.data) return;
      var on = r.data.accepting_orders;
      storeBtn.hidden = false; storeBtn.dataset.on = on;
      storeBtn.innerHTML = "Online orders: <b>" + (on ? "OPEN" : "CLOSED") + "</b>";
      storeBtn.classList.toggle("is-closed", !on);
      storeBtn.disabled = me.role !== "admin";
      storeBtn.title = me.role === "admin" ? "Tap to " + (on ? "close" : "open") + " online ordering" : "Only admins can change this";
    });
  }
  storeBtn.addEventListener("click", function () {
    var on = storeBtn.dataset.on === "true";
    if (!confirm(on ? "Close online ordering? Customers won't be able to check out until you open it again." : "Open online ordering?")) return;
    storeBtn.disabled = true;
    sb.from("settings").update({ accepting_orders: !on }).eq("id", 1).then(function (u) { if (u.error) alertBox(u.error.message); refreshStore(); });
  });

  // ------------------------------------------------------------ new orders / payments: chime, badge, tab title
  // Sound needs one tap on the page first (browser rule) — any click counts.
  var audio = null, watching = false, seen = { order: null, pays: 0 };
  document.addEventListener("pointerdown", function () {
    if (audio) return;
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  });
  function ding() {
    if (!audio) return;
    [[988, 0], [1319, 0.18]].forEach(function (n) {
      var o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + n[1];
      o.frequency.value = n[0]; g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.7);
    });
  }
  function watchNew() {
    Promise.all([
      sb.from("orders").select("id").order("created_at", { ascending: false }).limit(1),
      sb.from("payments").select("id", { count: "exact", head: true }).eq("status", "submitted")
    ]).then(function (r) {
      var newest = (r[0].data && r[0].data[0] && r[0].data[0].id) || "", pays = r[1].count || 0;
      var b = $("[data-pay-badge]"); b.textContent = pays || ""; b.hidden = !pays;
      document.title = (pays ? "(" + pays + ") " : "") + "Staff | Lakwa Burger Cafe";
      var fresh = seen.order !== null && (newest !== seen.order || pays > seen.pays);
      seen.order = newest; seen.pays = pays;
      if (fresh && me) {
        ding();
        var h = location.hash.slice(1) || "orders", busy = /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "");
        if (!busy && (h === "orders" || h === "payments" || h === "today")) route();
      }
    }).catch(function () {}).then(function () { setTimeout(watchNew, 20000); });
  }

  // ------------------------------------------------------------ today: sales summary + CSV export
  var CONFIRMED = ["paid", "preparing", "ready", "completed"];
  var day = { date: "", from: "", to: "" };
  function manilaDate(d) { return (d ? new Date(d) : new Date()).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); }
  function dayRange(q, from, to) { return q.gte("created_at", from + "T00:00:00+08:00").lte("created_at", to + "T23:59:59.999+08:00"); }
  function today() {
    loading();
    var d = day.date || manilaDate(), isToday = d === manilaDate();
    dayRange(sb.from("orders").select("id, order_no, status, total, discount, is_member, fulfillment, created_at, order_items(name, qty, line_total)"), d, d)
      .order("created_at").limit(2000).then(function (r) {
      if (r.error) return fail(r.error);
      var all = r.data, ok = all.filter(function (o) { return CONFIRMED.indexOf(o.status) >= 0; });
      var sum = function (xs, f) { return xs.reduce(function (a, x) { return a + Number(f(x)); }, 0); };
      var sales = sum(ok, function (o) { return o.total; });
      var waiting = all.filter(function (o) { return o.status === "awaiting_payment" || o.status === "payment_submitted"; }).length;
      var open = all.filter(function (o) { return ["paid", "preparing", "ready"].indexOf(o.status) >= 0; }).length;
      var types = {}, items = {};
      ok.forEach(function (o) {
        var t = types[o.fulfillment] || (types[o.fulfillment] = { n: 0, total: 0 }); t.n++; t.total += Number(o.total);
        o.order_items.forEach(function (it) { var x = items[it.name] || (items[it.name] = { qty: 0, total: 0 }); x.qty += it.qty; x.total += Number(it.line_total); });
      });
      var top = Object.keys(items).map(function (k) { return { name: k, qty: items[k].qty, total: items[k].total }; }).sort(function (a, b) { return b.qty - a.qty; }).slice(0, 10);
      var stat = function (label, value, note) { return '<div class="kpi"><span>' + label + "</span><b>" + value + "</b>" + (note ? '<small class="muted">' + note + "</small>" : "") + "</div>"; };
      view.innerHTML = '<div class="staff-head"><h1>' + (isToday ? "Today" : L.when(d + "T12:00:00+08:00", { dateStyle: "full", timeStyle: undefined })) + "</h1>" +
        '<form class="filters" data-day><input type="date" name="d" value="' + d + '" max="' + manilaDate() + '">' + (isToday ? "" : '<button type="button" class="link" data-today>Back to today</button>') + "</form>" +
        '<p class="muted">Online orders only. Sales count paid orders (paid → completed); cancelled and unpaid orders are left out.</p></div>' +
        '<div class="kpis">' +
        stat("Sales", peso(sales), ok.length + " paid order" + (ok.length === 1 ? "" : "s")) +
        stat("Average order", ok.length ? peso(Math.round(sales / ok.length)) : "-") +
        stat("Waiting for payment", waiting, waiting ? '<a href="#payments">Check payments →</a>' : "") +
        stat("In the kitchen", open, open ? '<a href="#board">Open the board →</a>' : "") +
        stat("Members", ok.filter(function (o) { return o.is_member; }).length, "discounts " + peso(sum(ok, function (o) { return o.discount; }))) +
        stat("Cancelled", all.filter(function (o) { return o.status === "cancelled"; }).length) + "</div>" +
        '<div class="staff-grid"><section class="card"><h2 class="card-title">Best sellers</h2>' +
        (top.length ? '<table class="table"><thead><tr><th>Item</th><th>Qty</th><th>Sales</th></tr></thead><tbody>' +
          top.map(function (x) { return "<tr><td>" + esc(x.name) + "</td><td>" + x.qty + "</td><td>" + peso(x.total) + "</td></tr>"; }).join("") + "</tbody></table>"
          : '<p class="muted">No paid orders yet.</p>') + "</section>" +
        '<section class="card"><h2 class="card-title">By order type</h2><table class="table"><tbody>' +
        ["dine_in", "pickup", "ride_thru"].map(function (k) { var t = types[k] || { n: 0, total: 0 }; return "<tr><td>" + L.FUL[k] + "</td><td>" + t.n + "</td><td>" + peso(t.total) + "</td></tr>"; }).join("") +
        "</tbody></table></section></div>" +
        '<section class="card"><h2 class="card-title">Download orders (spreadsheet)</h2>' +
        '<form class="filters" data-export><label>From <input type="date" name="from" value="' + (day.from || d) + '"></label><label>To <input type="date" name="to" value="' + (day.to || d) + '"></label>' +
        '<button class="btn btn--teal">Download CSV</button></form><p class="muted small">Opens in Excel or Google Sheets. One row per order, with its items. Handy for matching against UTAK.</p>' +
        '<p class="err" role="alert" data-error hidden></p></section>';
      var df = $("[data-day]", view);
      df.d.addEventListener("change", function () { day.date = df.d.value; today(); });
      var bt = $("[data-today]", view); if (bt) bt.addEventListener("click", function () { day.date = ""; today(); });
      $("[data-export]", view).addEventListener("submit", function (e) {
        e.preventDefault();
        var f = e.target, btn = $("button", f);
        day.from = f.from.value; day.to = f.to.value;
        if (!day.from || !day.to || day.from > day.to) return L.msg($("[data-error]", view), "Pick a From date that's on or before the To date.");
        btn.disabled = true; btn.textContent = "Preparing...";
        exportCsv(day.from, day.to).catch(function (x) { L.msg($("[data-error]", view), x.message); }).then(function () { btn.disabled = false; btn.textContent = "Download CSV"; });
      });
    });
  }
  function exportCsv(from, to) {
    return dayRange(sb.from("orders").select("order_no, created_at, status, customer_name, phone, email, is_member, fulfillment, notes, subtotal, discount, total, order_items(name, qty)"), from, to)
      .order("created_at").limit(5000).then(function (r) {
      if (r.error) throw r.error;
      var cell = function (v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var rows = [["Order", "Placed (Manila)", "Status", "Customer", "Phone", "Email", "Member", "Type", "Items", "Notes", "Subtotal", "Discount", "Total"]].concat(r.data.map(function (o) {
        return [o.order_no, L.when(o.created_at, { dateStyle: "short" }), L.STATUS[o.status], o.customer_name, o.phone, o.email, o.is_member ? "yes" : "", L.FUL[o.fulfillment],
          o.order_items.map(function (it) { return it.qty + "x " + it.name; }).join("; "), o.notes, o.subtotal, o.discount, o.total];
      }));
      var blob = new Blob(["﻿" + rows.map(function (x) { return x.map(cell).join(","); }).join("\r\n")], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "lakwa-orders-" + from + (to !== from ? "-to-" + to : "") + ".csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    });
  }

  // ------------------------------------------------------------ orders list (= history)
  function orders() {
    loading();
    var q = sb.from("orders").select("id, order_no, created_at, customer_name, email, phone, fulfillment, total, discount, is_member, status")
      .order("created_at", { ascending: false }).limit(200);
    if (filters.status === "active") q = q.in("status", ACTIVE); else if (filters.status !== "all") q = q.eq("status", filters.status);
    var s = clean(filters.q);
    if (s) q = q.or("order_no.ilike.%" + s + "%,customer_name.ilike.%" + s + "%,email.ilike.%" + s + "%,phone.ilike.%" + s + "%");
    if (filters.from) q = q.gte("created_at", filters.from + "T00:00:00+08:00");
    if (filters.to) q = q.lte("created_at", filters.to + "T23:59:59+08:00");
    Promise.all([q, sb.from("orders").select("status").in("status", ACTIVE)]).then(function (r) {
      if (r[0].error) return fail(r[0].error);
      var list = r[0].data, counts = {};
      (r[1].data || []).forEach(function (c) { counts[c.status] = (counts[c.status] || 0) + 1; });
      var sum = list.reduce(function (a, o) { return a + Number(o.total); }, 0);
      view.innerHTML =
        '<div class="staff-head"><h1>Orders</h1><div class="stat-row">' +
        [["payment_submitted", "to check"], ["paid", "paid"], ["preparing", "preparing"], ["ready", "ready"]].map(function (x) {
          return '<span class="stat"><b>' + (counts[x[0]] || 0) + "</b> " + x[1] + "</span>";
        }).join("") + '</div></div><nav class="tabs">' +
        TABS.map(function (t) { return '<a href="#orders" data-tab="' + t[0] + '" class="' + (filters.status === t[0] ? "on" : "") + '">' + t[1] + "</a>"; }).join("") +
        '</nav><form class="filters" data-filters><input name="q" value="' + esc(filters.q) + '" placeholder="Order no., name, email or phone">' +
        '<label>From <input type="date" name="from" value="' + esc(filters.from) + '"></label><label>To <input type="date" name="to" value="' + esc(filters.to) + '"></label>' +
        '<button class="btn btn--teal">Filter</button>' + (filters.q || filters.from || filters.to ? '<button type="button" class="link" data-clear>Clear</button>' : "") +
        '</form><div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Type</th><th>Total</th><th>Status</th></tr></thead><tbody>' +
        (list.map(function (o) {
          return '<tr><td><a href="#order=' + o.id + '"><b>' + esc(o.order_no) + "</b></a></td><td>" + L.when(o.created_at, { dateStyle: "short" }) +
            "</td><td>" + esc(o.customer_name) + (o.is_member ? ' <span class="pill pill--member">Member</span>' : "") +
            '<div class="muted small">' + esc(o.phone) + " · " + esc(o.email) + "</div></td><td>" + L.FUL[o.fulfillment] + "</td><td>" + peso(o.total) +
            (Number(o.discount) > 0 ? '<div class="muted small">−' + peso(o.discount) + " member</div>" : "") + "</td><td>" + pill(o.status) + "</td></tr>";
        }).join("") || '<tr><td colspan="6" class="muted">No orders here.</td></tr>') + "</tbody></table></div>" +
        (list.length ? '<p class="muted small">' + list.length + " orders · " + peso(sum) + " total" + (list.length === 200 ? " (showing latest 200, narrow the dates)" : "") + "</p>" : "");
      $$("[data-tab]", view).forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); filters.status = a.dataset.tab; orders(); }); });
      $("[data-filters]", view).addEventListener("submit", function (e) {
        e.preventDefault(); var f = e.target; filters.q = f.q.value; filters.from = f.from.value; filters.to = f.to.value; orders();
      });
      var c = $("[data-clear]", view); if (c) c.addEventListener("click", function () { filters.q = filters.from = filters.to = ""; orders(); });
    });
  }

  // ------------------------------------------------------------ payments helpers
  function enrich(pays) {
    if (!pays.length) return Promise.resolve([]);
    return sb.storage.from("payment-proofs").createSignedUrls(pays.map(function (p) { return p.proof_path; }), 900).then(function (r) {
      var urls = r.data || [];
      return pays.map(function (p, i) { p.url = urls[i] && urls[i].signedUrl; return p; });
    });
  }
  function paymentHtml(p, total) {
    return '<div class="pay-review"><div class="pay-proof">' +
      (p.url ? (/\.pdf$/i.test(p.proof_path) ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">Open PDF receipt</a>'
        : '<a href="' + esc(p.url) + '" target="_blank" rel="noopener"><img src="' + esc(p.url) + '" alt="GCash receipt"></a>') : '<span class="muted small">No preview</span>') +
      '</div><div class="pay-info"><p class="ref">Order total <b>' + peso(total) + "</b></p>" +
      (p.gcash_ref ? '<p class="muted small">Ref ' + esc(p.gcash_ref) + "</p>" : "") +
      '<p class="muted small">Uploaded ' + L.when(p.created_at) + "</p>" +
      '<p class="muted small">Check the cafe\'s GCash history shows ' + peso(total) + " received before verifying.</p>" +
      (p.status === "submitted"
        ? '<form class="review-form" data-review="' + p.id + '"><input name="note" placeholder="Note to customer (shown if rejected)"><div class="btn-row">' +
          '<button name="d" value="verify" class="btn btn--teal">Verified, start preparing</button><button name="d" value="reject" class="btn btn--outline-dark">Reject</button></div></form>'
        : "<p>" + '<span class="pill pill--' + p.status + '">' + p.status + "</span> " + (p.review_note ? '<span class="muted small">&quot;' + esc(p.review_note) + "&quot;</span>" : "") + "</p>") +
      "</div></div>";
  }
  function bindReviews(after) {
    $$("[data-review]", view).forEach(function (f) {
      var decision = "verify";
      $$("button", f).forEach(function (b) { b.addEventListener("click", function () { decision = b.value; }); });
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        $$("button", f).forEach(function (b) { b.disabled = true; });
        sb.rpc("review_payment", { p_payment_id: f.dataset.review, p_decision: decision, p_note: f.note.value }).then(function (r) {
          if (r.error || !r.data.ok) alertBox((r.data && r.data.error) || r.error.message);
          after();
        });
      });
    });
  }
  function alertBox(t) { var d = document.createElement("div"); d.className = "notice notice--warn"; d.textContent = t; view.prepend(d); }

  // ------------------------------------------------------------ order detail
  function orderDetail(id) {
    loading();
    sb.from("orders").select("*, order_items(*), payments(*)").eq("id", id).maybeSingle().then(function (r) {
      if (r.error || !r.data) return fail(r.error || { message: "Order not found." });
      var o = r.data;
      enrich(o.payments.sort(function (a, b) { return b.created_at.localeCompare(a.created_at); })).then(function (pays) {
        view.innerHTML = '<p><a href="#orders">← Orders</a></p><div class="staff-head"><h1>' + esc(o.order_no) + " " + pill(o.status) + '</h1><div class="btn-row">' +
          NEXT[o.status].map(function (n) { return '<button class="btn ' + (n[0] === "cancelled" ? "btn--outline-dark" : "btn--red") + '" data-set="' + n[0] + '">' + n[1] + "</button>"; }).join("") +
          '<button class="btn btn--outline-dark" data-print>Print ticket</button></div></div><div class="staff-grid"><section class="card"><h2 class="card-title">Customer</h2><p><b>' + esc(o.customer_name) + "</b> " +
          (o.is_member ? '<span class="pill pill--member">Member</span>' : "") + '</p><p><a href="tel:' + esc(o.phone) + '">' + esc(o.phone) + '</a> · <a href="mailto:' + esc(o.email) + '">' + esc(o.email) +
          "</a></p><p>" + L.FUL[o.fulfillment] + " · " + L.when(o.created_at) + "</p>" + (o.notes ? '<p class="notice">&quot;' + esc(o.notes) + "&quot;</p>" : "") +
          '</section><section class="card"><h2 class="card-title">Items</h2><ul class="cart-lines">' +
          o.order_items.map(function (it) {
            var c = Number(it.charged_unit_price) * it.qty, u = Number(it.unit_price) * it.qty;
            return "<li><span>" + it.qty + " × " + esc(it.name) + "</span><span>" + (c < u ? '<s class="muted">' + peso(u) + "</s> " : "") + peso(c) + "</span></li>";
          }).join("") + '</ul><dl class="totals"><div><dt>Subtotal (public, +' + Number(o.markup_pct) + "%)</dt><dd>" + peso(o.subtotal) + "</dd></div>" +
          (Number(o.discount) > 0 ? '<div class="disc"><dt>Member discount</dt><dd>−' + peso(o.discount) + "</dd></div>" : "") +
          '<div class="grand"><dt>Total due</dt><dd>' + peso(o.total) + '</dd></div></dl></section></div><section class="card"><h2 class="card-title">GCash payments</h2>' +
          (pays.length ? pays.map(function (p) { return paymentHtml(p, o.total); }).join("") : '<p class="muted">No payment uploaded yet.</p>') + "</section>";
        $$("[data-set]", view).forEach(function (b) {
          b.addEventListener("click", function () {
            if (b.dataset.set === "cancelled" && !confirm("Cancel order " + o.order_no + "?")) return;
            b.disabled = true;
            sb.from("orders").update({ status: b.dataset.set }).eq("id", o.id).then(function (u) { if (u.error) alertBox(u.error.message); else orderDetail(o.id); });
          });
        });
        $("[data-print]", view).addEventListener("click", function () { printTicket(o); });
        bindReviews(function () { orderDetail(o.id); });
      });
    });
  }
  // Kitchen / counter ticket, sized for small receipt printers (works on normal paper too).
  function printTicket(o) {
    var w = window.open("", "_blank", "width=400,height=640");
    if (!w) return alertBox("Allow pop-ups for this site to print tickets.");
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(o.order_no) + "</title><style>" +
      "body{font:14px/1.35 ui-monospace,Menlo,Consolas,monospace;width:72mm;margin:0 auto;padding:4mm 0;color:#000}" +
      "h1{font-size:30px;margin:4px 0;text-align:center}h2{font-size:13px;margin:0;text-align:center;letter-spacing:.1em}" +
      "p{margin:2px 0}hr{border:0;border-top:1px dashed #000;margin:8px 0}table{width:100%;border-collapse:collapse}td{padding:2px 0;vertical-align:top}" +
      "td.q{width:3ch;font-weight:700}td.r{text-align:right}.big{font-size:18px;font-weight:700}.note{border:1px solid #000;padding:4px;margin-top:6px}" +
      "@page{margin:0}</style></head><body>" +
      "<h2>LAKWA BURGER CAFE</h2><h1>" + esc(o.order_no.replace(/^\D*/, "")) + "</h1>" +
      '<p style="text-align:center">' + esc(o.order_no) + " · " + esc(L.when(o.created_at)) + "</p><hr>" +
      '<p class="big">' + esc(L.FUL[o.fulfillment]).toUpperCase() + "</p><p>" + esc(o.customer_name) + (o.is_member ? " (member)" : "") + "</p><p>" + esc(o.phone) + "</p><hr><table>" +
      o.order_items.map(function (it) { return '<tr><td class="q">' + it.qty + "</td><td>" + esc(it.name) + '</td><td class="r">' + esc(peso(Number(it.charged_unit_price) * it.qty)) + "</td></tr>"; }).join("") +
      "</table>" + (o.notes ? '<p class="note"><b>NOTE:</b> ' + esc(o.notes) + "</p>" : "") + "<hr>" +
      (Number(o.discount) > 0 ? "<p>Member discount: -" + esc(peso(o.discount)) + "</p>" : "") +
      '<p class="big">TOTAL ' + esc(peso(o.total)) + "</p><p>" + esc(L.STATUS[o.status]) + "</p>" +
      "<script>window.onload=function(){window.print()}<\/script></body></html>");
    w.document.close();
  }

  // ------------------------------------------------------------ payments (screenshots waiting for review)
  function payments() {
    loading();
    sb.from("payments").select("*, orders(order_no, total, customer_name, status)")
      .eq("status", "submitted").order("created_at", { ascending: true }).limit(50).then(function (r) {
      if (r.error) return fail(r.error);
      enrich(r.data).then(function (pays) {
        view.innerHTML = '<div class="staff-head"><h1>Payments</h1></div>' +
          '<h2 class="sub">Waiting for review (' + pays.length + ")</h2>" +
          (!pays.length ? '<p class="muted">All caught up. No payments waiting.</p>' : "") +
          pays.map(function (p) {
            return '<section class="card"><h3 class="card-title"><a href="#order=' + p.order_id + '">' + esc(p.orders.order_no) + "</a> · " + esc(p.orders.customer_name) + " " +
              pill(p.orders.status) + "</h3>" + paymentHtml(p, p.orders.total) + "</section>";
          }).join("");
        bindReviews(payments);
      });
    });
  }

  // ------------------------------------------------------------ order board (what the cashier screen shows)
  var boardTimer = null;
  function boardView() {
    view.innerHTML = '<div class="staff-head"><h1>Order board</h1><a class="btn btn--teal" href="' + L.base + '/board/" target="_blank" rel="noopener">Open the screen ↗</a>' +
      '<p class="muted">This is what customers see on the screen at the cashier (numbers only). Online orders show as Incoming until their payment is verified, then move to Preparing. Orders stay on the board until Collected or cancelled. ' +
      "Add walk-in orders with their UTAK receipt number.</p></div>" +
      '<form class="filters card board-walkin" data-walkin><label class="grow">Walk-in order no.' +
      '<input name="label" maxlength="8" required autocomplete="off" placeholder="UTAK receipt no., e.g. 57"></label>' +
      '<button class="btn btn--red">Add to Preparing</button></form>' +
      '<p class="err" role="alert" data-error hidden></p><div data-board-lists><p class="muted">Loading...</p></div>';
    var f = $("[data-walkin]", view);
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var label = f.label.value.trim();
      if (!label) return;
      $("button", f).disabled = true;
      sb.from("board_tickets").insert({ label: label }).then(function (r) {
        $("button", f).disabled = false;
        if (r.error) return L.msg($("[data-error]", view), r.error.message);
        L.msg($("[data-error]", view), "");
        f.label.value = ""; f.label.focus();
        loadBoard();
      });
    });
    loadBoard();
  }
  function loadBoard() {
    clearTimeout(boardTimer);
    Promise.all([
      sb.from("orders").select("id, order_no, status, fulfillment, customer_name, created_at, updated_at")
        .in("status", ["awaiting_payment", "payment_submitted", "paid", "preparing", "ready"]),
      sb.from("board_tickets").select("id, label, status, created_at, updated_at").in("status", ["preparing", "ready"])
    ]).then(function (r) {
      var box = $("[data-board-lists]", view);
      if (!box) return;                                   // left the Board tab
      if (r[0].error || r[1].error) return L.msg($("[data-error]", view), (r[0].error || r[1].error).message);
      var items = r[0].data.map(function (o) {
        var ready = o.status === "ready";
        return { kind: "order", id: o.id, no: o.order_no.replace(/^\D*/, ""), at: ready ? o.updated_at : o.created_at,
          col: o.status === "awaiting_payment" || o.status === "payment_submitted" ? "incoming" : ready ? "ready" : "preparing",
          status: o.status,
          sub: "Online · " + (o.status === "awaiting_payment" ? "no GCash screenshot yet · " : o.status === "payment_submitted" ? "screenshot to check · " : "") +
            L.FUL[o.fulfillment] + " · " + o.customer_name + " · " + L.when(o.created_at, { dateStyle: "short" }) };
      }).concat(r[1].data.map(function (t) {
        var ready = t.status === "ready";
        return { kind: "walkin", id: t.id, no: t.label, col: t.status, at: ready ? t.updated_at : t.created_at, sub: "Walk-in · added " + L.when(t.created_at, { dateStyle: undefined }) };
      }));
      function list(col) {
        var xs = items.filter(function (i) { return i.col === col; })
          .sort(function (a, b) { return col === "ready" ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at); });
        return xs.map(function (i) {
          var ref = i.kind + "|" + i.id;
          return '<li class="board-item"><b>' + esc(i.no) + '</b><span class="muted small">' + esc(i.sub) + '</span><div class="btn-row">' +
            (col === "incoming"
              ? '<a class="btn btn--teal" href="#order=' + i.id + '">' + (i.status === "payment_submitted" ? "Check payment →" : "Open order →") + "</a>"
              : col === "preparing"
              ? '<button class="btn btn--red" data-move="' + ref + '|ready">Ready ✓</button>' +
                (i.kind === "walkin" ? '<button class="btn btn--outline-dark" data-move="' + ref + '|remove">Remove</button>' : "")
              : '<button class="btn btn--teal" data-move="' + ref + '|completed">Collected</button>' +
                '<button class="btn btn--outline-dark" data-move="' + ref + '|preparing">← Back</button>') +
            "</div></li>";
        }).join("") || '<li class="muted">Nothing here.</li>';
      }
      box.innerHTML = '<div class="board-admin"><section><h2 class="sub">Incoming (not verified yet)</h2><ul class="board-list">' + list("incoming") + "</ul></section>" +
        '<section><h2 class="sub">Preparing</h2><ul class="board-list">' + list("preparing") + "</ul></section>" +
        '<section><h2 class="sub">Ready (waiting to be collected)</h2><ul class="board-list">' + list("ready") + "</ul></section></div>";
      $$("[data-move]", box).forEach(function (b) {
        b.addEventListener("click", function () {
          var p = b.dataset.move.split("|"), table = p[0] === "order" ? "orders" : "board_tickets";
          b.disabled = true;
          var q = p[2] === "remove" ? sb.from(table).delete().eq("id", p[1]) : sb.from(table).update({ status: p[2] }).eq("id", p[1]);
          q.then(function (u) { if (u.error) L.msg($("[data-error]", view), u.error.message); loadBoard(); });
        });
      });
      boardTimer = setTimeout(loadBoard, 10000);
    });
  }

  // ------------------------------------------------------------ registered customers
  function passcodeResult(d) {
    if (!d.ok) return '<p class="err">' + esc(d.error) + "</p>";
    return '<div class="notice ' + (d.emailed ? "notice--ok" : "notice--warn") + '">' +
      (d.emailed ? "Passcode emailed to <b>" + esc(d.email) + "</b>." : "<b>Email isn't switched on yet.</b> Share this passcode with " + esc(d.name) + " yourself:") +
      '<div class="passcode">' + esc(d.passcode) + '</div><span class="muted small">Shown once. It\'s stored encrypted and can\'t be viewed again.</span></div>';
  }
  function customers(search, flash) {
    loading();
    var q = sb.from("customers").select("id, email, full_name, phone, extra_discount_pct, is_active, notes, locked_until, passcode_sent_at, created_at")
      .order("created_at", { ascending: false }).limit(500);
    var s = clean(search);
    if (s) q = q.or("full_name.ilike.%" + s + "%,email.ilike.%" + s + "%,phone.ilike.%" + s + "%");
    Promise.all([q, sb.from("membership_requests").select("*").eq("status", "pending").order("created_at")]).then(function (rr) {
      var r = rr[0], reqs = rr[1].data || [];
      if (r.error) return fail(r.error);
      view.innerHTML = '<div class="staff-head"><h1>Earth School Community</h1><p class="muted">Members get the community price when they enter their email + passcode at checkout. Guests request to join at <a href="' + L.base + '/community/" target="_blank" rel="noopener">/community/</a>.</p></div>' +
        '<section class="card"><h2 class="card-title">Requests to join (' + reqs.length + ')</h2>' +
        (reqs.length ? reqs.map(function (q) {
          return '<div class="req" data-req="' + q.id + '"><div><b>' + esc(q.full_name) + '</b><div class="muted small">' + esc(q.email) + " · " + esc(q.phone || "") +
            " · " + L.when(q.created_at) + "</div>" +
            '<p class="small"><b>Community role:</b> ' + esc(q.community_role || "Not recorded (older request)") + "</p>" +
            (q.message ? '<p class="small">&quot;' + esc(q.message) + "&quot;</p>" : "") +
            '</div><div class="req-actions"><label class="small">Extra % <input type="number" min="0" max="100" value="0" data-req-extra></label>' +
            '<button class="btn btn--teal" data-approve>Approve &amp; email passcode</button>' +
            '<input placeholder="Reason (optional, emailed)" data-req-note><button class="btn btn--outline-dark" data-decline>Decline</button></div>' +
            '<div class="full" data-req-result></div></div>';
        }).join("") : '<p class="muted">No requests waiting.</p>') + "</section>" +
        '<form class="card fields grid-form" data-new><h2 class="card-title">Add a member directly</h2>' +
        '<label>Full name<input name="name" required></label><label>Email<input name="email" type="email" required></label>' +
        '<label>Mobile (optional)<input name="phone" type="tel"></label>' +
        '<label>Extra discount % (optional)<input name="extra" type="number" min="0" max="100" step="1" value="0"><span class="hint">0 = pays the pre-increase price. Add more only for special cases.</span></label>' +
        '<label class="full">Notes (staff only)<input name="notes" placeholder="e.g. Lakwa rider, staff family"></label>' +
        '<div class="full"><button class="btn btn--red">Create &amp; email passcode</button></div><div class="full" data-result>' + (flash || "") + "</div></form>" +
        '<form class="filters" data-search><input name="q" value="' + esc(search || "") + '" placeholder="Search name, email or phone"><button class="btn btn--teal">Search</button></form>' +
        '<div class="table-wrap"><table class="table"><thead><tr><th>Customer</th><th>Extra %</th><th>Passcode</th><th>Status</th><th></th></tr></thead><tbody>' +
        (r.data.map(function (c) {
          var locked = c.locked_until && new Date(c.locked_until) > new Date();
          return '<tr class="' + (c.is_active ? "" : "dim") + '" data-id="' + c.id + '"><td><b>' + esc(c.full_name) + '</b><div class="muted small">' + esc(c.email) + (c.phone ? " · " + esc(c.phone) : "") + "</div>" +
            (c.notes ? '<div class="muted small">' + esc(c.notes) + "</div>" : "") + '</td><td><span class="inline-form"><input type="number" min="0" max="100" value="' + Number(c.extra_discount_pct) +
            '" data-extra><button class="link" data-save-extra>Save</button></span></td><td><div class="muted small">' +
            (c.passcode_sent_at ? "Emailed " + L.when(c.passcode_sent_at, { timeStyle: undefined }) : "Not emailed") + '</div><button class="link" data-reset>New passcode</button><div data-reset-result></div></td><td>' +
            (c.is_active ? '<span class="pill pill--paid">Active</span>' : '<span class="pill pill--cancelled">Disabled</span>') + (locked ? ' <span class="pill pill--rejected">Locked</span>' : "") +
            '</td><td class="row-actions">' + (locked ? '<button class="link" data-unlock>Unlock</button>' : "") +
            '<button class="link" data-active="' + (!c.is_active) + '">' + (c.is_active ? "Disable" : "Enable") + "</button></td></tr>";
        }).join("") || '<tr><td colspan="5" class="muted">No registered customers yet.</td></tr>') + "</tbody></table></div>";

      $("[data-new]", view).addEventListener("submit", function (e) {
        e.preventDefault(); var f = e.target, b = $("button", f); b.disabled = true; b.textContent = "Creating...";
        sb.rpc("create_customer", { p_email: f.email.value, p_name: f.name.value, p_phone: f.phone.value, p_extra: Number(f.extra.value) || 0, p_notes: f.notes.value })
          .then(function (x) {
            var d = x.error ? { ok: false, error: x.error.message } : x.data;
            if (d.ok) return customers(search, passcodeResult(d));
            b.disabled = false; b.textContent = "Create & email passcode"; $("[data-result]", f).innerHTML = passcodeResult(d);
          });
      });
      $("[data-search]", view).addEventListener("submit", function (e) { e.preventDefault(); customers(e.target.q.value); });
      $$("[data-req]", view).forEach(function (box) {
        var id = box.dataset.req, out = $("[data-req-result]", box);
        $("[data-approve]", box).addEventListener("click", function () {
          var b = this; b.disabled = true; b.textContent = "Approving...";
          sb.rpc("approve_membership", { p_id: id, p_extra: Number($("[data-req-extra]", box).value) || 0 }).then(function (x) {
            var d = x.error ? { ok: false, error: x.error.message } : x.data;
            if (d.ok) return customers(search, passcodeResult(d));
            b.disabled = false; b.textContent = "Approve & email passcode"; out.innerHTML = passcodeResult(d);
          });
        });
        $("[data-decline]", box).addEventListener("click", function () {
          if (!confirm("Decline this request?")) return;
          sb.rpc("decline_membership", { p_id: id, p_note: $("[data-req-note]", box).value }).then(function (x) {
            if (x.error || !x.data.ok) return (out.innerHTML = '<p class="err">' + esc((x.data && x.data.error) || x.error.message) + "</p>");
            customers(search);
          });
        });
      });
      $$("tr[data-id]", view).forEach(function (tr) {
        var id = tr.dataset.id, upd = function (patch) {
          sb.from("customers").update(patch).eq("id", id).then(function (u) { if (u.error) alertBox(u.error.message); else customers(search); });
        };
        $("[data-save-extra]", tr).addEventListener("click", function () { upd({ extra_discount_pct: Math.max(0, Math.min(100, Number($("[data-extra]", tr).value) || 0)) }); });
        $("[data-active]", tr).addEventListener("click", function () { upd({ is_active: this.dataset.active === "true" }); });
        var un = $("[data-unlock]", tr); if (un) un.addEventListener("click", function () { upd({ failed_attempts: 0, locked_until: null }); });
        $("[data-reset]", tr).addEventListener("click", function () {
          var b = this; if (!confirm("Send a new passcode? The old one stops working.")) return;
          b.disabled = true; b.textContent = "Sending...";
          sb.rpc("reset_passcode", { p_id: id }).then(function (x) {
            b.disabled = false; b.textContent = "New passcode";
            $("[data-reset-result]", tr).innerHTML = passcodeResult(x.error ? { ok: false, error: x.error.message } : x.data);
          });
        });
      });
    });
  }

  // ------------------------------------------------------------ photos (menu items, GCash QR) → public "site-images" bucket
  // Shrinks big phone photos to max 1400px JPEG before upload so pages stay fast.
  function shrink(file, max) {
    return new Promise(function (resolve) {
      if (!window.createImageBitmap) return resolve(file);
      createImageBitmap(file).then(function (img) {
        var k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { resolve(b || file); }, "image/jpeg", 0.85);
      }).catch(function () { resolve(file); });
    });
  }
  function uploadImage(file, folder) {
    if (!file) return Promise.reject(new Error("Choose a photo first."));
    if (!/^image\//.test(file.type)) return Promise.reject(new Error("That file isn't a photo."));
    return shrink(file, 1400).then(function (blob) {
      var type = blob.type || "image/jpeg", ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
      var path = folder + "/" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + "." + ext;
      return sb.storage.from("site-images").upload(path, blob, { contentType: type, upsert: false }).then(function (u) {
        if (u.error) throw u.error;
        return sb.storage.from("site-images").getPublicUrl(path).data.publicUrl;
      });
    });
  }

  // ------------------------------------------------------------ menu & prices (admin)
  var menuFilter = { q: "", cat: "" };
  function menu(openId) {
    loading();
    Promise.all([sb.from("menu_items").select("*").order("sort_order").order("name"), sb.from("settings").select("markup_pct").eq("id", 1).single()]).then(function (r) {
      if (r[0].error) return fail(r[0].error);
      var items = r[0].data, markup = Number(r[1].data.markup_pct), byId = {};
      items.forEach(function (it) { byId[it.id] = it; });
      var cats = items.map(function (it) { return it.category || "Other"; }).filter(function (c, i, a) { return a.indexOf(c) === i; });
      var thumb = function (it) {
        return '<span class="menu-thumb">' + (it.image_url ? '<img src="' + esc(L.sized(it.image_url, 300)) + '" alt="" loading="lazy">' : "No photo") + "</span>";
      };
      var priceLine = function (base) {
        return peso(L.publicPrice(base, markup)) + (markup ? ' <span class="muted small">(base ' + peso(base) + ")</span>" : "");
      };
      var form = function (it) {
        var base = it ? Number(it.base_price) : "";
        return '<form class="card fields grid-form menu-edit" data-item="' + (it ? it.id : "") + '">' +
          '<div class="full menu-photo">' + (it ? thumb(it) : '<span class="menu-thumb">No photo</span>') +
          '<div><label>Photo<input name="photo" type="file" accept="image/*"></label>' +
          '<span class="hint">JPG or PNG from your phone is fine. It\'s resized automatically.</span>' +
          (it && it.image_url ? ' <button type="button" class="link" data-remove-photo>Remove photo</button>' : "") + "</div></div>" +
          '<label>Name<input name="name" required value="' + esc(it ? it.name : "") + '"></label>' +
          '<label>Category<input name="category" list="menu-cats" value="' + esc(it ? it.category : (menuFilter.cat || "Burgers")) + '"></label>' +
          '<label>Base price (₱)' + (markup ? " (before the +" + markup + "% increase)" : "") + '<input name="base_price" type="number" min="0" step="1" required value="' + base + '">' +
          (it ? '<span class="hint">Public pays <b>' + peso(L.publicPrice(base, markup)) + "</b> · Members pay <b>" + peso(L.memberPrice(base)) + "</b> (before their extra %)</span>" : "") + "</label>" +
          '<label>Sort order<input name="sort_order" type="number" value="' + (it ? it.sort_order : 99) + '"><span class="hint">Lower numbers show first.</span></label>' +
          '<label class="full">Description<input name="description" value="' + esc(it ? it.description : "") + '"></label>' +
          '<label class="check"><input type="checkbox" name="is_available"' + (!it || it.is_available ? " checked" : "") + "> On the menu (untick = sold out / hidden)</label>" +
          '<p class="err full" role="alert" data-error hidden></p>' +
          '<div class="full btn-row"><button class="btn btn--red">' + (it ? "Save" : "Add item") + "</button>" +
          '<button type="button" class="btn btn--outline-dark" data-cancel>Cancel</button>' +
          (it ? '<button type="button" class="btn btn--outline-dark menu-delete" data-delete>Delete item</button>' : "") + "</div></form>";
      };
      var row = function (it) {
        return '<li class="menu-row' + (it.is_available ? "" : " is-off") + '" data-row="' + it.id + '">' + thumb(it) +
          '<div class="menu-row-main"><b>' + esc(it.name) + "</b>" + (it.description ? '<span class="muted small">' + esc(it.description) + "</span>" : "") + "</div>" +
          '<div class="menu-row-price">' + priceLine(Number(it.base_price)) + "</div>" +
          '<div class="btn-row"><button class="btn ' + (it.is_available ? "btn--outline-dark" : "btn--teal") + '" data-toggle="' + it.id + '">' + (it.is_available ? "Hide" : "Show") + "</button>" +
          '<button class="btn btn--red" data-edit="' + it.id + '">Edit</button></div></li>';
      };
      view.innerHTML = '<div class="staff-head"><h1>Menu &amp; prices</h1><button class="btn btn--red" data-add>+ Add item</button>' +
        '<p class="muted">' + (markup ? "Enter each item's <b>base price</b>; the public price adds " + markup + "% automatically (change it in Settings). " : "Prices shown are what the public pays. ") +
        "<b>Hide</b> takes an item off the online menu (sold out) without deleting it.</p></div>" +
        '<form class="filters" data-menu-filter><input name="q" placeholder="Search the menu" value="' + esc(menuFilter.q) + '">' +
        '<select name="cat"><option value="">All categories</option>' + cats.map(function (c) { return '<option' + (c === menuFilter.cat ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select></form>" +
        '<datalist id="menu-cats">' + cats.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("") + "</datalist>" +
        '<div data-new></div><div data-menu-list></div>';
      var listEl = $("[data-menu-list]", view);
      function draw() {
        var q = menuFilter.q.toLowerCase();
        var shown = items.filter(function (it) {
          return (!menuFilter.cat || (it.category || "Other") === menuFilter.cat) && (!q || (it.name + " " + (it.description || "")).toLowerCase().indexOf(q) >= 0);
        });
        listEl.innerHTML = cats.map(function (c) {
          var xs = shown.filter(function (it) { return (it.category || "Other") === c; });
          if (!xs.length) return "";
          return '<h2 class="sub">' + esc(c) + ' <span class="muted small">' + xs.length + "</span></h2><ul class=\"menu-list\">" + xs.map(row).join("") + "</ul>";
        }).join("") || '<p class="muted">No items match.</p>';
      }
      draw();
      var ff = $("[data-menu-filter]", view);
      ff.addEventListener("input", function () { menuFilter.q = ff.q.value; menuFilter.cat = ff.cat.value; draw(); });
      ff.addEventListener("submit", function (e) { e.preventDefault(); });

      function bindForm(f, it, close) {
        var err = $("[data-error]", f);
        $("[data-cancel]", f).addEventListener("click", close);
        var rm = $("[data-remove-photo]", f);
        if (rm) rm.addEventListener("click", function () {
          if (!confirm("Remove the photo from " + it.name + "?")) return;
          sb.from("menu_items").update({ image_url: null }).eq("id", it.id).then(function (u) { if (u.error) L.msg(err, u.error.message); else menu(it.id); });
        });
        var del = $("[data-delete]", f);
        if (del) del.addEventListener("click", function () {
          if (!confirm("Delete " + it.name + " for good? Past orders keep their line, but the item leaves the menu. (Use Hide for sold out.)")) return;
          sb.from("menu_items").delete().eq("id", it.id).then(function (u) { if (u.error) L.msg(err, u.error.message); else menu(); });
        });
        f.addEventListener("submit", function (e) {
          e.preventDefault();
          var btn = $("button.btn--red", f);
          var data = {
            name: f.name.value.trim(), category: f.category.value.trim() || "Other", base_price: Math.max(0, Number(f.base_price.value) || 0),
            sort_order: Number(f.sort_order.value) || 0, description: f.description.value.trim(), is_available: f.is_available.checked
          };
          if (!data.name) return L.msg(err, "Give the item a name.");
          btn.disabled = true; btn.textContent = f.photo.files[0] ? "Uploading photo..." : "Saving...";
          var photo = f.photo.files[0] ? uploadImage(f.photo.files[0], "menu") : Promise.resolve(null);
          photo.then(function (url) {
            if (url) data.image_url = url;
            return it ? sb.from("menu_items").update(data).eq("id", it.id).select("id").single()
              : sb.from("menu_items").insert(Object.assign({ slug: data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now().toString(36) }, data)).select("id").single();
          }).then(function (u) {
            if (u.error) throw u.error;
            menu(u.data.id);
          }).catch(function (x) {
            btn.disabled = false; btn.textContent = it ? "Save" : "Add item";
            L.msg(err, (x && x.message) || "Couldn't save. Try again.");
          });
        });
      }
      function openEdit(id) {
        var li = $('[data-row="' + id + '"]', listEl);
        if (!li) return;
        li.innerHTML = form(byId[id]); li.classList.add("is-editing");
        bindForm($("form", li), byId[id], function () { draw(); });
        li.scrollIntoView({ block: "center" });
      }
      listEl.addEventListener("click", function (e) {
        var ed = e.target.closest("[data-edit]"), tg = e.target.closest("[data-toggle]");
        if (ed) openEdit(ed.dataset.edit);
        if (tg) {
          var it = byId[tg.dataset.toggle]; tg.disabled = true;
          sb.from("menu_items").update({ is_available: !it.is_available }).eq("id", it.id).then(function (u) {
            if (u.error) return alertBox(u.error.message);
            it.is_available = !it.is_available; draw();
          });
        }
      });
      $("[data-add]", view).addEventListener("click", function () {
        var box = $("[data-new]", view);
        box.innerHTML = '<h2 class="sub">New item</h2>' + form(null);
        bindForm($("form", box), null, function () { box.innerHTML = ""; });
        box.scrollIntoView({ block: "start" });
      });
      if (openId && byId[openId]) {
        // After saving, show the saved item (clear filters that would hide it)
        var it = byId[openId];
        if (menuFilter.cat && menuFilter.cat !== (it.category || "Other")) { menuFilter.cat = ""; ff.cat.value = ""; draw(); }
        var li = $('[data-row="' + openId + '"]', listEl);
        if (li) { li.classList.add("is-saved"); li.scrollIntoView({ block: "center" }); }
      }
    });
  }

  // ------------------------------------------------------------ settings (admin)
  function settings() {
    loading();
    sb.from("settings").select("*").eq("id", 1).single().then(function (r) {
      if (r.error) return fail(r.error);
      var s = r.data;
      view.innerHTML = '<div class="staff-head"><h1>Settings</h1></div><form class="card fields grid-form" data-settings>' +
        '<label>Price increase for the public (%)<input name="markup_pct" type="number" min="0" max="200" step="0.5" value="' + Number(s.markup_pct) + '"><span class="hint">Registered customers are not affected.</span></label>' +
        '<label class="check"><input type="checkbox" name="accepting_orders"' + (s.accepting_orders ? " checked" : "") + "> Accepting online orders</label>" +
        '<label>GCash account name<input name="gcash_name" value="' + esc(s.gcash_name) + '"></label>' +
        '<label>GCash number<input name="gcash_number" value="' + esc(s.gcash_number) + '"></label>' +
        '<div class="full menu-photo"><span class="menu-thumb">' + (s.gcash_qr_url ? '<img src="' + esc(s.gcash_qr_url) + '" alt="GCash QR">' : "No QR") + "</span>" +
        '<div><label>GCash QR code (optional)<input name="qr" type="file" accept="image/*"></label><span class="hint">Upload a screenshot of your GCash QR. Customers see it on their order page.</span>' +
        (s.gcash_qr_url ? ' <label class="check"><input type="checkbox" name="qr_remove"> Remove the QR</label>' : "") + "</div></div>" +
        '<div class="full"><button class="btn btn--red">Save settings</button> <span class="muted small" data-saved></span></div></form>';
      $("[data-settings]", view).addEventListener("submit", function (e) {
        e.preventDefault(); var f = e.target, saved = $("[data-saved]", f);
        var data = {
          markup_pct: Math.max(0, Math.min(200, Number(f.markup_pct.value) || 0)), accepting_orders: f.accepting_orders.checked,
          gcash_name: f.gcash_name.value.trim(), gcash_number: f.gcash_number.value.trim()
        };
        if (f.qr_remove && f.qr_remove.checked) data.gcash_qr_url = null;
        saved.textContent = f.qr.files[0] ? "Uploading QR..." : "Saving...";
        (f.qr.files[0] ? uploadImage(f.qr.files[0], "gcash") : Promise.resolve(null)).then(function (url) {
          if (url) data.gcash_qr_url = url;
          return sb.from("settings").update(data).eq("id", 1);
        }).then(function (u) {
          if (u.error) throw u.error;
          refreshStore(); settings();
        }).catch(function (x) { saved.textContent = ""; alertBox(x.message || "Couldn't save."); });
      });
    });
  }

  boot();
})();
