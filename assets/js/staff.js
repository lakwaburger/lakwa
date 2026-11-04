/* /staff/ — staff dashboard (Supabase Auth email + password).
   Views (hash routes): #orders, #order=<id>, #board, #payments, #customers, #menu, #settings */
(function () {
  "use strict";
  var sb = L.sb, esc = L.esc, peso = L.peso, $ = L.$, $$ = L.$$;
  var view = $("[data-view]");
  var me = null;
  var ACTIVE = ["payment_submitted", "paid", "preparing", "ready"];
  var TABS = [["active", "Active"], ["payment_submitted", "Check payment"], ["awaiting_payment", "Awaiting payment"], ["paid", "Paid"],
    ["preparing", "Preparing"], ["ready", "Ready"], ["completed", "Completed"], ["cancelled", "Cancelled"], ["all", "All / history"]];
  var NEXT = {
    awaiting_payment: [["paid", "Mark paid (cash / other)"], ["cancelled", "Cancel order"]],
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
    btn.disabled = true; btn.textContent = "Signing in…";
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
  function loading() { view.innerHTML = '<p class="muted">Loading…</p>'; }
  function fail(e) { view.innerHTML = '<div class="notice notice--warn">' + esc(e && e.message || "Something went wrong.") + "</div>"; }
  function pill(s) { return '<span class="pill pill--' + s + '">' + (L.STATUS[s] || s) + "</span>"; }
  function clean(q) { return String(q || "").replace(/[,()%*]/g, " ").trim(); }

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
        (list.length ? '<p class="muted small">' + list.length + " orders · " + peso(sum) + " total" + (list.length === 200 ? " (showing latest 200 — narrow the dates)" : "") + "</p>" : "");
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
          '<button name="d" value="verify" class="btn btn--teal">Verify payment</button><button name="d" value="reject" class="btn btn--outline-dark">Reject</button></div></form>'
        : "<p>" + '<span class="pill pill--' + p.status + '">' + p.status + "</span> " + (p.review_note ? '<span class="muted small">“' + esc(p.review_note) + "”</span>" : "") + "</p>") +
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
          '</div></div><div class="staff-grid"><section class="card"><h2 class="card-title">Customer</h2><p><b>' + esc(o.customer_name) + "</b> " +
          (o.is_member ? '<span class="pill pill--member">Member</span>' : "") + '</p><p><a href="tel:' + esc(o.phone) + '">' + esc(o.phone) + '</a> · <a href="mailto:' + esc(o.email) + '">' + esc(o.email) +
          "</a></p><p>" + L.FUL[o.fulfillment] + " · " + L.when(o.created_at) + "</p>" + (o.notes ? '<p class="notice">“' + esc(o.notes) + "”</p>" : "") +
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
        bindReviews(function () { orderDetail(o.id); });
      });
    });
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
          (!pays.length ? '<p class="muted">All caught up — no payments waiting.</p>' : "") +
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
      '<p class="muted">This is what customers see on the screen at the cashier (numbers only). Online orders appear here once they\'re paid. ' +
      "Add walk-in orders with their UTAK receipt number.</p></div>" +
      '<form class="filters card board-walkin" data-walkin><label class="grow">Walk-in order no.' +
      '<input name="label" maxlength="8" required autocomplete="off" placeholder="UTAK receipt no., e.g. 57"></label>' +
      '<button class="btn btn--red">Add to Preparing</button></form>' +
      '<p class="err" role="alert" data-error hidden></p><div data-board-lists><p class="muted">Loading…</p></div>';
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
    var since = new Date(Date.now() - 16 * 3600 * 1000).toISOString();
    Promise.all([
      sb.from("orders").select("id, order_no, status, fulfillment, customer_name, created_at, updated_at")
        .in("status", ["paid", "preparing", "ready"]).gte("created_at", since),
      sb.from("board_tickets").select("id, label, status, created_at, updated_at").in("status", ["preparing", "ready"]).gte("created_at", since)
    ]).then(function (r) {
      var box = $("[data-board-lists]", view);
      if (!box) return;                                   // left the Board tab
      if (r[0].error || r[1].error) return L.msg($("[data-error]", view), (r[0].error || r[1].error).message);
      var items = r[0].data.map(function (o) {
        var ready = o.status === "ready";
        return { kind: "order", id: o.id, no: o.order_no.replace(/^\D*/, ""), col: ready ? "ready" : "preparing", at: ready ? o.updated_at : o.created_at,
          sub: "Online · " + L.FUL[o.fulfillment] + " · " + o.customer_name };
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
            (col === "preparing"
              ? '<button class="btn btn--red" data-move="' + ref + '|ready">Ready ✓</button>' +
                (i.kind === "walkin" ? '<button class="btn btn--outline-dark" data-move="' + ref + '|remove">Remove</button>' : "")
              : '<button class="btn btn--teal" data-move="' + ref + '|completed">Collected</button>' +
                '<button class="btn btn--outline-dark" data-move="' + ref + '|preparing">← Back</button>') +
            "</div></li>";
        }).join("") || '<li class="muted">Nothing here.</li>';
      }
      box.innerHTML = '<div class="board-admin"><section><h2 class="sub">Preparing</h2><ul class="board-list">' + list("preparing") + "</ul></section>" +
        '<section><h2 class="sub">Ready — waiting to be collected</h2><ul class="board-list">' + list("ready") + "</ul></section></div>";
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
      '<div class="passcode">' + esc(d.passcode) + '</div><span class="muted small">Shown once — it\'s stored encrypted and can\'t be viewed again.</span></div>';
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
      view.innerHTML = '<div class="staff-head"><h1>Each School Community</h1><p class="muted">Members pay the original (pre-increase) price when they enter their email + passcode at checkout. Guests request to join at <a href="' + L.base + '/community/" target="_blank" rel="noopener">/community/</a>.</p></div>' +
        '<section class="card"><h2 class="card-title">Requests to join (' + reqs.length + ')</h2>' +
        (reqs.length ? reqs.map(function (q) {
          return '<div class="req" data-req="' + q.id + '"><div><b>' + esc(q.full_name) + '</b><div class="muted small">' + esc(q.email) + " · " + esc(q.phone || "") +
            " · " + L.when(q.created_at) + "</div>" + (q.message ? '<p class="small">“' + esc(q.message) + "”</p>" : "") +
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
        e.preventDefault(); var f = e.target, b = $("button", f); b.disabled = true; b.textContent = "Creating…";
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
          var b = this; b.disabled = true; b.textContent = "Approving…";
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
          b.disabled = true; b.textContent = "Sending…";
          sb.rpc("reset_passcode", { p_id: id }).then(function (x) {
            b.disabled = false; b.textContent = "New passcode";
            $("[data-reset-result]", tr).innerHTML = passcodeResult(x.error ? { ok: false, error: x.error.message } : x.data);
          });
        });
      });
    });
  }

  // ------------------------------------------------------------ menu & prices (admin)
  function menu() {
    loading();
    Promise.all([sb.from("menu_items").select("*").order("sort_order"), sb.from("settings").select("markup_pct").eq("id", 1).single()]).then(function (r) {
      if (r[0].error) return fail(r[0].error);
      var markup = Number(r[1].data.markup_pct);
      var form = function (it) {
        var base = it ? Number(it.base_price) : "";
        return '<form class="card fields grid-form menu-edit" data-item="' + (it ? it.id : "") + '">' +
          '<label>Name<input name="name" required value="' + esc(it ? it.name : "") + '"></label>' +
          '<label>Category<input name="category" value="' + esc(it ? it.category : "Burgers") + '"></label>' +
          '<label>Base price (₱) — pre-increase<input name="base_price" type="number" min="0" step="1" required value="' + base + '">' +
          (it ? '<span class="hint">Public pays <b>' + peso(L.publicPrice(base, markup)) + "</b> (+" + markup + "%) · Members pay <b>" + peso(L.memberPrice(base)) + "</b></span>" : "") + "</label>" +
          '<label>Sort order<input name="sort_order" type="number" value="' + (it ? it.sort_order : 99) + '"></label>' +
          '<label class="full">Description<input name="description" value="' + esc(it ? it.description : "") + '"></label>' +
          '<label class="full">Image URL<input name="image_url" value="' + esc(it && it.image_url || "") + '"></label>' +
          '<label class="check"><input type="checkbox" name="is_available"' + (!it || it.is_available ? " checked" : "") + "> Available</label>" +
          '<div><button class="btn btn--red">' + (it ? "Save" : "Add item") + "</button> <span class=\"muted small\" data-saved></span></div></form>";
      };
      view.innerHTML = '<div class="staff-head"><h1>Menu &amp; prices</h1><p class="muted">Enter each item\'s <b>base price</b> (what it cost before the increase). The public price adds ' +
        markup + "% automatically (change the % in Settings). Registered customers keep paying the base price.</p></div>" +
        r[0].data.map(form).join("") + '<h2 class="sub">Add a new item</h2>' + form(null);
      $$("[data-item]", view).forEach(function (f) {
        f.addEventListener("submit", function (e) {
          e.preventDefault();
          var row = {
            name: f.name.value.trim(), category: f.category.value.trim() || "Burgers", base_price: Math.max(0, Number(f.base_price.value) || 0),
            sort_order: Number(f.sort_order.value) || 0, description: f.description.value.trim(), image_url: f.image_url.value.trim() || null,
            is_available: f.is_available.checked
          };
          var id = f.dataset.item;
          var p = id ? sb.from("menu_items").update(row).eq("id", id)
            : sb.from("menu_items").insert(Object.assign({ slug: row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now().toString(36) }, row));
          p.then(function (u) { if (u.error) alertBox(u.error.message); else menu(); });
        });
      });
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
        '<label class="full">GCash QR image URL (optional)<input name="gcash_qr_url" value="' + esc(s.gcash_qr_url || "") + '" placeholder="https://…/gcash-qr.png"><span class="hint">Put the QR image in the repo (e.g. assets/img/gcash-qr.png) or any public link, then paste the full URL.</span></label>' +
        '<div class="full"><button class="btn btn--red">Save settings</button> <span class="muted small" data-saved></span></div></form>';
      $("[data-settings]", view).addEventListener("submit", function (e) {
        e.preventDefault(); var f = e.target;
        sb.from("settings").update({
          markup_pct: Math.max(0, Math.min(200, Number(f.markup_pct.value) || 0)), accepting_orders: f.accepting_orders.checked,
          gcash_name: f.gcash_name.value.trim(), gcash_number: f.gcash_number.value.trim(), gcash_qr_url: f.gcash_qr_url.value.trim() || null
        }).eq("id", 1).then(function (u) { if (u.error) alertBox(u.error.message); else $("[data-saved]", f).textContent = "Saved ✓"; });
      });
    });
  }

  boot();
})();
