/* /community/ — request to join The Earth Community. Staff approve it in the dashboard. */
(function () {
  "use strict";
  var form = L.$("[data-community-form]");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var err = L.$("[data-error]", form), btn = L.$("button", form);
    L.msg(err, "");
    if (!form.name.value.trim()) return L.msg(err, "Please enter your name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.value.trim())) return L.msg(err, "Please enter a valid email.");
    if (!form.phone.value.trim()) return L.msg(err, "Please enter your mobile number.");
    btn.disabled = true; btn.textContent = "Sending…";
    L.sb.rpc("request_membership", {
      p_name: form.name.value, p_email: form.email.value, p_phone: form.phone.value, p_message: form.message.value
    }).then(function (r) {
      var d = r.data;
      if (r.error || !d || !d.ok) {
        btn.disabled = false; btn.textContent = "Request to join";
        return L.msg(err, (d && d.error) || "Couldn't send that right now. Please try again.");
      }
      L.$("[data-community]").innerHTML = '<div class="card"><h2 class="card-title">Thanks, ' + L.esc(form.name.value.trim().split(" ")[0]) +
        '! Your request is in.</h2><p>Our team will review it. Once you\'re approved you\'ll get an email at <b>' + L.esc(form.email.value.trim()) +
        '</b> with your member passcode.</p><p><a class="btn btn--red" href="' + L.base + '/order/">Order now</a></p></div>';
    });
  });
})();
