/* Staff-only Earth School Community ID verification and legacy classification. */
(function () {
  "use strict";
  var sb = L.sb, $ = L.$, esc = L.esc, roles = ["Parent of a student", "Student", "Kalye Artisano tenant"];
  var login = $("[data-login]"), app = $("[data-app]"), result = $("[data-result]");
  function message(el, text, good) {
    el.innerHTML = '<p class="' + (good ? 'notice notice--ok' : 'notice notice--warn') + '">' + esc(text) + '</p>';
  }
  function showLogin(err) {
    L.show(app, false); L.show(login, true);
    L.msg($("[data-error]", login), err || "");
  }
  function roleOptions(value) {
    return '<option value="">Choose classification</option>' + roles.map(function (r) {
      return '<option value="' + esc(r) + '"' + (r === value ? ' selected' : '') + '>' + esc(r) + '</option>';
    }).join("");
  }
  function renderMember(c) {
    if (!c) { message(result, "No member found with that reference number.", false); return; }
    result.innerHTML = '<div class="card" style="margin-top:18px;border:2px solid ' + (c.is_active ? '#49747e' : '#b10b0e') + '">' +
      '<p class="eyebrow">' + (c.is_active ? 'Active membership' : 'Membership disabled') + '</p>' +
      '<h2 class="card-title">' + esc(c.full_name) + '</h2>' +
      '<p><b>Classification:</b> ' + esc(c.community_role || 'Not assigned') + '</p>' +
      '<p><b>Reference:</b> ' + esc(c.member_ref) + '</p>' +
      '<p><b>Discount eligibility:</b> ' + (c.is_active && c.community_role ? '<span class="pill pill--paid">Verified — eligible</span>' : '<span class="pill pill--cancelled">Not eligible</span>') + '</p>' +
      '</div>';
  }
  function lookup(ref) {
    result.innerHTML = '<p class="muted">Checking membership...</p>';
    sb.from("customers").select("id,member_ref,full_name,community_role,is_active").eq("member_ref", ref.trim().toUpperCase()).maybeSingle().then(function (r) {
      if (r.error) return message(result, r.error.message, false);
      renderMember(r.data);
    });
  }
  function loadLegacy(isAdmin) {
    if (!isAdmin) return;
    var box = $("[data-unclassified]"), list = $("[data-legacy-list]");
    L.show(box, true);
    sb.from("customers").select("id,member_ref,full_name,email,community_role,community_id_sent_at")
      .eq("is_active", true).is("community_role", null).order("created_at").then(function (r) {
        if (r.error) { list.textContent = r.error.message; return; }
        if (!r.data.length) { list.innerHTML = '<p class="muted">All active members have a classification.</p>'; return; }
        list.innerHTML = r.data.map(function (c) {
          return '<div class="req" data-customer="' + c.id + '"><div><b>' + esc(c.full_name) + '</b>' +
            '<div class="muted small">' + esc(c.email) + ' · ' + esc(c.member_ref) + '</div></div>' +
            '<div class="req-actions"><select data-role>' + roleOptions("") + '</select>' +
            '<button class="btn btn--teal" data-save>Save &amp; email ID</button><span data-status></span></div></div>';
        }).join("");
        $$(".req[data-customer]", list).forEach(function (row) {
          $("[data-save]", row).addEventListener("click", function () {
            var role = $("[data-role]", row).value, btn = this, status = $("[data-status]", row);
            if (!role) { status.textContent = "Choose a classification first."; return; }
            btn.disabled = true; btn.textContent = "Saving...";
            sb.rpc("set_customer_community_role", { p_customer_id: row.dataset.customer, p_role: role }).then(function (x) {
              btn.disabled = false; btn.textContent = "Save & email ID";
              if (x.error || !x.data || !x.data.ok) { status.textContent = (x.data && x.data.error) || (x.error && x.error.message) || "Could not save."; return; }
              status.textContent = x.data.emailed ? "Saved — ID emailed." : "Saved, but email could not be queued.";
              loadLegacy(true);
            });
          });
        });
      });
  }
  function boot() {
    sb.auth.getSession().then(function (r) {
      if (!r.data.session) return showLogin();
      sb.from("staff").select("full_name,role").eq("user_id", r.data.session.user.id).maybeSingle().then(function (s) {
        if (!s.data) { sb.auth.signOut(); return showLogin("This account isn't set up as staff."); }
        L.show(login, false); L.show(app, true);
        $("[data-who]").textContent = s.data.full_name || r.data.session.user.email;
        loadLegacy(s.data.role === "admin");
        var ref = new URLSearchParams(location.search).get("ref");
        if (ref) { $("[name=ref]", app).value = ref; lookup(ref); }
      });
    });
  }
  $("[data-login-form]").addEventListener("submit", function (e) {
    e.preventDefault(); var f = e.target, b = $("button", f);
    b.disabled = true; b.textContent = "Signing in...";
    sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value }).then(function (r) {
      b.disabled = false; b.textContent = "Sign in";
      if (r.error) return L.msg($("[data-error]", f), "Wrong email or password.");
      boot();
    });
  });
  $("[data-signout]").addEventListener("click", function () { sb.auth.signOut().then(function () { showLogin(); }); });
  $("[data-lookup]").addEventListener("submit", function (e) { e.preventDefault(); lookup(e.target.ref.value); });
  boot();
})();