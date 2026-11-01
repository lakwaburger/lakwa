/* /order/view/?id=…&t=… — receipt, status tracker and GCash proof upload. */
(function () {
  "use strict";
  var root = L.$("[data-order-view]");
  var q = new URLSearchParams(location.search), id = q.get("id"), token = q.get("t");
  var STEPS = ["awaiting_payment", "payment_submitted", "paid", "preparing", "ready", "completed"];

  function notFound() {
    root.innerHTML = '<div class="page-head"><h1 class="display display--lg">Order not found</h1><p class="lede">Check the link in your order email, or call ' +
      L.esc(L.C.phone) + ".</p></div>";
  }
  if (!id || !token) return notFound();

  function load() {
    L.sb.rpc("get_order", { p_id: id, p_token: token }).then(function (r) {
      if (r.error || !r.data) return notFound();
      render(r.data);
    });
  }

  function render(o) {
    var total = Number(o.total), stepIdx = STEPS.indexOf(o.status);
    var pending = o.payments.some(function (p) { return p.status === "submitted"; });
    var canPay = o.status === "awaiting_payment" || (o.status === "payment_submitted" && !pending);
    var rejected = o.payments.filter(function (p) { return p.status === "rejected"; })[0];
    var h = '<div class="page-head"><p class="eyebrow">Order ' + L.esc(o.order_no) + '</p><h1 class="display display--lg">' + L.STATUS[o.status] +
      '</h1><p class="lede">' + L.when(o.created_at) + " · " + L.FUL[o.fulfillment] + (o.is_member ? " · Member pricing" : "") +
      '</p><p class="muted small">Bookmark this page — it\'s your receipt and order tracker.</p></div>';
    if (o.status !== "cancelled") {
      h += '<ol class="steps">' + ["Pay", "Confirmed", "Preparing", "Ready", "Done"].map(function (l, i) {
        return '<li class="' + (stepIdx >= i + 1 ? "on" : "") + '">' + l + "</li>";
      }).join("") + "</ol>";
    }
    h += '<section class="card"><h2 class="card-title">Items</h2><ul class="cart-lines">' + o.items.map(function (it) {
      return "<li><span>" + it.qty + " × " + L.esc(it.name) + "</span><span>" + L.peso(Number(it.charged_unit_price) * it.qty) + "</span></li>";
    }).join("") + '</ul><dl class="totals"><div><dt>Subtotal</dt><dd>' + L.peso(o.subtotal) + "</dd></div>" +
      (Number(o.discount) > 0 ? '<div class="disc"><dt>Member discount</dt><dd>−' + L.peso(o.discount) + "</dd></div>" : "") +
      '<div class="grand"><dt>Total</dt><dd>' + L.peso(total) + "</dd></div></dl></section>";

    if (canPay) {
      h += '<section class="card"><h2 class="card-title">Pay with GCash</h2><ol class="pay-steps">' +
        "<li>Open GCash → <b>Send Money</b>" + (o.gcash.qr ? " (or scan the QR)" : "") + ".</li>" +
        "<li>Send exactly <b>" + L.peso(total) + "</b> to <b>" + L.esc(o.gcash.number) + "</b> (" + L.esc(o.gcash.name) + ").</li>" +
        "<li>Put <b>" + L.esc(o.order_no) + "</b> in the message if you can.</li>" +
        "<li>Screenshot the receipt and upload it below with the 13-digit reference no.</li></ol>" +
        (o.gcash.qr ? '<img class="gcash-qr" src="' + L.esc(o.gcash.qr) + '" alt="GCash QR code">' : "") +
        (rejected ? '<div class="notice notice--warn">We couldn\'t match your last payment' + (rejected.review_note ? ": " + L.esc(rejected.review_note) : ".") + " Please upload it again.</div>" : "") +
        '<form class="fields pay-form" data-pay>' +
        '<label>GCash reference no. (13 digits)<input name="ref" required inputmode="numeric" autocomplete="off" placeholder="1234 567 891234"></label>' +
        '<label>Amount sent<input name="amount" required inputmode="decimal" value="' + total + '"><span class="hint">Should be exactly ' + L.peso(total) + "</span></label>" +
        '<label>Your GCash name (optional)<input name="sender_name" placeholder="As shown in GCash, e.g. JU** D."></label>' +
        '<label>Your GCash number (optional)<input name="sender_number" inputmode="tel" placeholder="09xx xxx xxxx"></label>' +
        '<label>Receipt screenshot<input name="proof" type="file" required accept="image/*,application/pdf"></label>' +
        '<p class="err" role="alert" data-error hidden></p>' +
        '<button class="btn btn--red btn--block">Submit payment</button></form></section>';
    } else if (pending) {
      h += '<div class="notice notice--ok"><b>Receipt received.</b> We\'re matching your GCash reference number — this page updates when it\'s confirmed.</div>';
    }

    if (o.payments.length) {
      h += '<section class="card"><h2 class="card-title">Payments</h2><ul class="cart-lines">' + o.payments.map(function (p) {
        var label = p.status === "submitted" ? "Checking" : p.status === "verified" ? "Confirmed" : "Not matched";
        return "<li><span>Ref " + L.esc(p.gcash_ref) + " · " + L.peso(p.amount) + '</span><span class="pill pill--' + p.status + '">' + label + "</span></li>";
      }).join("") + "</ul></section>";
    }
    h += '<p class="muted small">Questions? Call or text <a href="tel:' + L.esc(L.C.tel) + '">' + L.esc(L.C.phone) + "</a>.</p>";
    root.innerHTML = h;

    var f = L.$("[data-pay]", root);
    if (f) f.addEventListener("submit", submit);
    if (pending) setTimeout(load, 30000);
  }

  var ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
  function submit(e) {
    e.preventDefault();
    var f = e.target, err = L.$("[data-error]", f), btn = L.$("button", f);
    var ref = f.ref.value.replace(/\D/g, ""), amount = Number(String(f.amount.value).replace(/[^\d.]/g, "")), file = f.proof.files[0];
    L.msg(err, "");
    if (ref.length !== 13) return L.msg(err, "The GCash reference number has 13 digits — please check your receipt.");
    if (!amount) return L.msg(err, "Enter the amount you sent.");
    if (!file) return L.msg(err, "Please attach a screenshot of your GCash receipt.");
    if (file.size > 6 * 1024 * 1024) return L.msg(err, "Screenshot is too large (max 6 MB).");
    if (file.type && ALLOWED.indexOf(file.type) < 0) return L.msg(err, "Upload a JPG, PNG, WEBP, HEIC or PDF.");
    btn.disabled = true; btn.textContent = "Uploading…";
    var ext = ((file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg").slice(0, 5);
    var rand = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
    var path = id + "/" + token + "/" + rand + "." + ext;
    L.sb.storage.from("payment-proofs").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false })
      .then(function (up) {
        if (up.error) throw new Error("upload");
        return L.sb.rpc("submit_payment", {
          p_id: id, p_token: token, p_ref: ref, p_amount: amount,
          p_sender_name: f.sender_name.value, p_sender_number: f.sender_number.value, p_proof_path: path
        });
      })
      .then(function (r) {
        var d = r.data;
        if (r.error || !d || !d.ok) {
          btn.disabled = false; btn.textContent = "Submit payment";
          return L.msg(err, (d && d.error) || "Upload failed. Please try again.");
        }
        load();
      })
      .catch(function () { btn.disabled = false; btn.textContent = "Submit payment"; L.msg(err, "Upload failed. Please try again."); });
  }

  load();
})();
