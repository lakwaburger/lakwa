/* Homepage: replace the built-in menu with live items and prices from Supabase. */
(function () {
  var grid = L.$("[data-home-menu]");
  if (!grid || !L.sb) return;
  Promise.all([
    L.sb.from("menu_items").select("name, description, base_price, image_url").eq("is_available", true).order("sort_order"),
    L.sb.from("settings").select("markup_pct").eq("id", 1).maybeSingle()
  ]).then(function (r) {
    var items = r[0].data, markup = r[1].data ? Number(r[1].data.markup_pct) : 20;
    if (!items || !items.length) return;
    grid.innerHTML = items.map(function (m) {
      return '<li class="menu-card"><div class="menu-card-img">' +
        (m.image_url ? '<img src="' + L.esc(L.sized(m.image_url, 750)) + '" alt="' + L.esc(m.name) + '" loading="lazy">' : "") +
        '</div><div class="menu-card-body"><h3 class="menu-card-title">' + L.esc(m.name) + '</h3><p class="menu-card-price">' +
        L.peso(L.publicPrice(Number(m.base_price), markup)) + '</p><p class="menu-card-desc">' + L.esc(m.description) + "</p></div></li>";
    }).join("");
  });
})();
