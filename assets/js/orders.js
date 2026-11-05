/* /orders/ — registered customers see their order history (email + passcode). */
(function () {
  "use strict";
  var form = L.$("[data-history-form]"), box = L.$("[data-history]");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var err = L.$("[data-error]", form), btn = L.$("button", form);
    L.msg(err, ""); btn.disabled = true; btn.textContent = "Checking...";
    L.sb.rpc("lookup_orders", { p_email: form.email.value, p_passcode: form.passcode.value }).then(function (r) {
      btn.disabled = false; btn.textContent = "View my orders";
      var d = r.data;
      if (r.error || !d || !d.ok) return L.msg(err, (d && d.error) || "Couldn't check that right now.");
      var rows = d.orders.map(function (o) {
        return '<tr><td><a href="' + L.base + "/order/view/?id=" + o.id + "&t=" + o.access_token + '">' + L.esc(o.order_no) + "</a></td><td>" +
          L.when(o.created_at, { timeStyle: undefined }) + "</td><td>" + L.FUL[o.fulfillment] + "</td><td>" + L.peso(o.total) +
          '</td><td><span class="pill pill--' + o.status + '">' + L.STATUS[o.status] + "</span></td></tr>";
      }).join("");
      box.innerHTML = '<section class="card"><h2 class="card-title">Hi ' + L.esc(d.name) + ", you have " + d.orders.length + " order" + (d.orders.length === 1 ? "" : "s") + "</h2>" +
        (d.orders.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Date</th><th>Type</th><th>Total</th><th>Status</th></tr></thead><tbody>' + rows + "</tbody></table></div>"
          : '<p class="muted">No orders yet.</p>') + "</section>";
    });
  });
})();
