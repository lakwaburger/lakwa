/* /order/ — cart + checkout. Prices shown here are a preview; place_order() in the database decides the real total. */
(function () {
  "use strict";
  var CART_KEY = "lakwa-cart";
  var form = L.$("[data-checkout]");
  var menuEl = L.$("[data-menu]"), chipsEl = L.$("[data-chips]"), searchEl = L.$("[data-search]");
  var state = { items: [], groups: [], openKey: null, query: "", markup: 20, accepting: true, cart: {}, member: null };

  try { state.cart = JSON.parse(localStorage.getItem(CART_KEY) || "{}") || {}; } catch (e) { state.cart = {}; }
  function save() { try { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); } catch (e) {} }

  function pub(m) { return L.publicPrice(m.base_price, state.markup); }
  function charged(m) { return state.member && state.member.prices[m.id] != null ? Number(state.member.prices[m.id]) : pub(m); }
  function lines() { return state.items.filter(function (m) { return state.cart[m.id] > 0; }).map(function (m) { return { m: m, qty: state.cart[m.id] }; }); }

  // Menu sections. Similar categories are shown together; any new category staff add gets its own section.
  // Sections follow the menu's sort order (Staff → Menu & prices).
  var GROUPS = [
    { key: "burgers", label: "Burgers", cats: ["classic burgers", "burgers", "burger"] },
    { key: "signature", label: "Signature burgers", cats: ["signature burgers", "signature burger"] },
    { key: "addons", label: "Add-ons", cats: ["add ons", "add-ons", "addons", "sides"] },
    { key: "icecream", label: "Ice cream", cats: ["ice cream"] },
    { key: "breakfast", label: "Breakfast", cats: ["breakfast"] },
    { key: "drinks", label: "Beers & sodas", cats: ["beers & sodas", "beers and sodas", "drinks", "sodas", "beers"] },
    { key: "coffee", label: "Coffee, tea & more", cats: ["coffee", "tea"] },
    { key: "shakes", label: "Shakes", cats: ["shakes", "shake"] }
  ];
  function groupFor(cat) {
    var c = String(cat || "").trim().toLowerCase();
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].cats.indexOf(c) >= 0) return GROUPS[i];
    return { key: "c-" + (c.replace(/[^a-z0-9]+/g, "-") || "more"), label: String(cat || "").trim() || "More" };
  }
  function buildGroups() {
    var byKey = {}, list = [];
    state.items.forEach(function (m) {
      var g = groupFor(m.category);
      if (!byKey[g.key]) { byKey[g.key] = { key: g.key, label: g.label, items: [] }; list.push(byKey[g.key]); }
      byKey[g.key].items.push(m);
    });
    state.groups = list; // items arrive in sort order, so sections do too
    if (!state.openKey && list.length) state.openKey = list[0].key;
  }
  function inCart(g) { return g.items.reduce(function (n, m) { return n + (state.cart[m.id] || 0); }, 0); }
  function matches(m, q) { return (m.name + " " + (m.description || "")).toLowerCase().indexOf(q) >= 0; }

  function itemHtml(m) {
    var q = state.cart[m.id] || 0, p = pub(m), c = charged(m);
    var price = c < p ? "<s>" + L.peso(p) + '</s> <span class="member-price">' + L.peso(c) + "</span>" : L.peso(p);
    var ctrl = q > 0
      ? '<button type="button" data-dec="' + m.id + '" aria-label="Remove one ' + L.esc(m.name) + '">−</button><span>' + q +
        '</span><button type="button" data-inc="' + m.id + '" aria-label="Add one ' + L.esc(m.name) + '">+</button>'
      : '<button type="button" class="qty-add" data-inc="' + m.id + '" aria-label="Add ' + L.esc(m.name) + '">Add</button>';
    return '<li class="order-item' + (m.image_url ? "" : " no-img") + '">' +
      (m.image_url ? '<div class="order-item-img"><img src="' + L.esc(L.sized(m.image_url, 200)) + '" alt="" loading="lazy"></div>' : "") +
      '<div class="order-item-body"><h3>' + L.esc(m.name) + '</h3><p class="order-item-desc">' + L.esc(m.description || "") +
      '</p><p class="order-item-price">' + price + '</p></div><div class="qty">' + ctrl + "</div></li>";
  }

  function renderMenu() {
    var q = state.query.trim().toLowerCase();
    var html = state.groups.map(function (g) {
      var items = q ? g.items.filter(function (m) { return matches(m, q); }) : g.items;
      if (q && !items.length) return "";
      var open = q ? true : state.openKey === g.key, n = inCart(g);
      return '<section class="menu-group' + (open ? " is-open" : "") + '" id="g-' + g.key + '">' +
        '<button type="button" class="menu-group-head" data-group="' + g.key + '" aria-expanded="' + open + '">' +
        '<span class="mg-title">' + L.esc(g.label) + '</span><span class="mg-meta">' +
        (n ? '<span class="mg-badge">' + n + " in cart</span>" : "") +
        "<span>" + items.length + (items.length === 1 ? " item" : " items") + '</span><span class="mg-chev" aria-hidden="true"></span></span></button>' +
        (open ? '<ul class="mg-items">' + items.map(itemHtml).join("") + "</ul>" : "") + "</section>";
    }).join("");
    menuEl.innerHTML = html || (q ? '<p class="muted">Nothing on the menu matches &quot;' + L.esc(state.query.trim()) + '&quot;.</p>'
      : '<p class="muted">The menu is empty right now.</p>');
    chipsEl.innerHTML = state.groups.map(function (g) {
      var n = inCart(g);
      return '<button type="button" data-jump="' + g.key + '"' + (!q && state.openKey === g.key ? ' class="on"' : "") + ">" +
        L.esc(g.label) + (n ? "<b>" + n + "</b>" : "") + "</button>";
    }).join("");
  }

  function openGroup(key, toggle) {
    state.openKey = toggle && state.openKey === key ? null : key;
    if (state.query) { state.query = ""; searchEl.value = ""; }
    renderMenu();
    var el = document.getElementById("g-" + key);
    if (el && state.openKey === key) el.scrollIntoView({ behavior: "smooth", block: "start" });
    var chip = chipsEl.querySelector('[data-jump="' + key + '"]');
    if (chip && chip.scrollIntoView) chip.scrollIntoView({ block: "nearest", inline: "center" });
  }

  function renderCart() {
    var ls = lines(), count = 0, sub = 0, tot = 0;
    ls.forEach(function (l) { count += l.qty; sub += pub(l.m) * l.qty; tot += charged(l.m) * l.qty; });
    L.$("[data-cart]").innerHTML = ls.length
      ? '<ul class="cart-lines">' + ls.map(function (l) {
          return "<li><span>" + l.qty + " × " + L.esc(l.m.name) + "</span><span>" + L.peso(charged(l.m) * l.qty) + "</span></li>";
        }).join("") + "</ul>"
      : '<p class="muted">Your cart is empty. Add something tasty.</p>';
    L.$("[data-totals]").innerHTML = "<div><dt>Subtotal</dt><dd>" + L.peso(sub) + "</dd></div>" +
      (sub !== tot ? '<div class="disc"><dt>Member discount</dt><dd>−' + L.peso(sub - tot) + "</dd></div>" : "") +
      '<div class="grand"><dt>Total</dt><dd>' + L.peso(tot) + "</dd></div>";
    var memberMode = L.$("[data-member-toggle]").checked;
    var btn = L.$("[data-submit]");
    btn.disabled = !state.accepting || !ls.length || (memberMode && !state.member);
    var hint = !state.accepting ? "Online ordering isn't open right now. Please call " + L.C.phone + "."
      : memberMode && !state.member ? "Apply your member details first, or untick the box to order as a guest." : "";
    L.msg(L.$("[data-hint]"), hint);
    var bar = L.$("[data-cart-bar]");
    bar.hidden = !count;
    bar.innerHTML = "<span>" + count + " item" + (count === 1 ? "" : "s") + "</span><b>Checkout · " + L.peso(tot) + "</b>";
  }
  function render() { renderMenu(); renderCart(); }

  chipsEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-jump]");
    if (b) openGroup(b.getAttribute("data-jump"), false);
  });
  searchEl.addEventListener("input", function () { state.query = searchEl.value; renderMenu(); });

  menuEl.addEventListener("click", function (e) {
    var head = e.target.closest("[data-group]");
    if (head) return openGroup(head.getAttribute("data-group"), true);
    var inc = e.target.closest("[data-inc]"), dec = e.target.closest("[data-dec]");
    if (!inc && !dec) return;
    var id = (inc || dec).getAttribute(inc ? "data-inc" : "data-dec");
    var q = (state.cart[id] || 0) + (inc ? 1 : -1);
    if (q <= 0) delete state.cart[id]; else state.cart[id] = Math.min(50, q);
    save(); render();
  });

  // fulfillment segmented control
  L.$$(".seg input").forEach(function (r) {
    r.addEventListener("change", function () {
      L.$$(".seg label").forEach(function (l) { l.classList.toggle("on", l.querySelector("input").checked); });
    });
  });

  // member box
  var toggle = L.$("[data-member-toggle]");
  toggle.addEventListener("change", function () {
    if (!toggle.checked) clearMember();
    L.show(L.$("[data-member-fields]"), toggle.checked && !state.member);
    renderCart();
  });
  function clearMember() {
    state.member = null;
    L.$("[data-m-pass]").value = "";
    L.show(L.$("[data-m-ok]"), false);
    L.show(L.$("[data-email-row]"), true);
    L.msg(L.$("[data-m-msg]"), "");
    L.show(L.$("[data-member-fields]"), toggle.checked);
    render();
  }
  L.$("[data-m-apply]").addEventListener("click", function () {
    var btn = this, email = L.$("[data-m-email]").value.trim(), pass = L.$("[data-m-pass]").value.trim();
    if (!email || !pass) return L.msg(L.$("[data-m-msg]"), "Enter your registered email and passcode.");
    btn.disabled = true; btn.textContent = "Checking...";
    L.sb.rpc("check_member", { p_email: email, p_passcode: pass }).then(function (r) {
      btn.disabled = false; btn.textContent = "Apply";
      var d = r.data;
      if (r.error || !d || !d.ok) return L.msg(L.$("[data-m-msg]"), (d && d.error) || "Couldn't check that right now.");
      state.member = { name: d.name, prices: d.prices, email: email.toLowerCase(), passcode: pass };
      L.msg(L.$("[data-m-msg]"), "");
      L.show(L.$("[data-member-fields]"), false);
      L.show(L.$("[data-email-row]"), false);
      var ok = L.$("[data-m-ok]");
      ok.innerHTML = "✓ Member prices applied for <b>" + L.esc(d.name) + '</b>. <button type="button" class="link" data-m-change>Change</button>';
      ok.hidden = false;
      if (!form.name.value) form.name.value = d.name;
      if (!form.phone.value && d.phone) form.phone.value = d.phone;
      render();
    });
  });
  L.$("[data-m-ok]").addEventListener("click", function (e) { if (e.target.closest("[data-m-change]")) clearMember(); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var err = L.$("[data-error]"), btn = L.$("[data-submit]");
    L.msg(err, "");
    if (!form.name.value.trim() || !form.phone.value.trim()) return L.msg(err, "Please enter your name and mobile number.");
    if (!state.member && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.value.trim())) return L.msg(err, "Please enter a valid email for your receipt.");
    btn.disabled = true; btn.textContent = "Placing order...";
    var payload = {
      items: lines().map(function (l) { return { id: l.m.id, qty: l.qty }; }),
      name: form.name.value, phone: form.phone.value,
      email: state.member ? state.member.email : form.email.value,
      fulfillment: (L.$(".seg input:checked") || {}).value || "pickup",
      notes: form.notes.value,
      member: state.member ? { email: state.member.email, passcode: state.member.passcode } : null
    };
    L.sb.rpc("place_order", { p: payload }).then(function (r) {
      var d = r.data;
      if (r.error || !d || !d.ok) {
        btn.textContent = "Checkout · Pay with GCash"; renderCart();
        return L.msg(err, (d && d.error) || "Something went wrong placing your order. Please try again.");
      }
      state.cart = {}; save();
      location.href = L.base + "/order/view/?id=" + encodeURIComponent(d.id) + "&t=" + encodeURIComponent(d.token);
    });
  });

  // load menu + settings
  Promise.all([
    L.sb.from("menu_items").select("id, name, description, base_price, image_url, category, sort_order").eq("is_available", true).order("sort_order"),
    L.sb.from("settings").select("markup_pct, accepting_orders").eq("id", 1).maybeSingle()
  ]).then(function (r) {
    if (r[0].error) { menuEl.innerHTML = '<p class="err">Couldn\'t load the menu. Please refresh or call ' + L.esc(L.C.phone) + ".</p>"; return; }
    state.items = r[0].data.map(function (m) { m.base_price = Number(m.base_price); return m; });
    if (r[1].data) { state.markup = Number(r[1].data.markup_pct); state.accepting = r[1].data.accepting_orders; }
    Object.keys(state.cart).forEach(function (id) { if (!state.items.some(function (m) { return m.id === id; })) delete state.cart[id]; });
    buildGroups();
    L.$("[data-menu-tools]").hidden = !state.items.length;
    render();
  });
})();
