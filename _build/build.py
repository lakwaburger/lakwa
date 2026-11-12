# -*- coding: utf-8 -*-
"""Builds the static Lakwa Burger Cafe site into the repo root.
Run:  python3 _build/build.py
Edit facts in SITE / MENU below; page copy in the page_* functions."""
import html, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
E = html.escape
VER = "20261112a"  # bump to bust browser caches after changing CSS/JS

# Where the site lives. Own domain (lakwaburger.com, see CNAME) = "" (site root).
# Was "/lakwa" when served from migquesada.github.io/lakwa/.
BASE = ""

CDN = "https://images.squarespace-cdn.com/content/v1/66ee374b9956fe4e4593e2cc"

def local(path, fallback):
    """Use the copy in this repo when it exists, else the old Squarespace image."""
    return BASE + path if os.path.exists(os.path.join(ROOT, path.lstrip("/"))) else fallback
SITE = {
    "name": "Lakwa Burger Cafe",
    "brand": "Lakwa Motorcycle Tours",
    "main": "https://lakwamotorcycles.com",
    "logo": local("/assets/img/logo.png", f"{CDN}/8984bcaf-9fff-45b9-aeee-f2c6c766cd3e/Untitled-7.png?format=500w"),
    # Photos live in this repo (assets/img): the Squarespace image server is blocked on some networks (e.g. the cafe's Starlink).
    "hero": local("/assets/img/hero.jpg", f"{CDN}/a81a023e-2415-4f00-af1a-0247f41efcbc/edbae927-58c6-469e-80a1-fb893f9cd834.jpg?format=2500w"),
    "badge": local("/assets/img/badge.png", f"{CDN}/d45edc45-997f-4687-b370-a41c37ddd510/580b57fcd9996e24bc43c543.png?format=300w"),
    "favicon": local("/assets/img/favicon.png", f"{CDN}/9472beb5-5b7e-4ed1-9041-5f9f8ebf079c/favicon.ico"),
    "address": ["Kalye Artisano, Lio Estate", "Villa Libertad, El Nido, Palawan 5315"],
    "phone": "(0931) 154-9766",
    "tel": "+639311549766",
    "whatsapp": "https://wa.me/639311549766",
    "instagram": "https://www.instagram.com/lakwamotorcycles/",
    "facebook": "https://www.facebook.com/lakwatseromotorcycles",
    "maps": "https://www.google.com/maps/search/?api=1&query=Kalye+Artisano%2C+Lio+Estate%2C+Villa+Libertad%2C+El+Nido%2C+Palawan",
}

# Shown on the homepage before live prices load (mirrors supabase/seed.sql). Prices = base (pre-increase).
MENU = [
    ("Cheese burger", "120 GR. Beef Patty, home made brioche, Edam cheese, Ketchup and Lakwanaise.", 349, local("/assets/img/menu/classic-burgers-cheese-burger.jpg", "https://hwkydsigfcgbyiyukzbr.supabase.co/storage/v1/object/public/site-images/menu/mw1th7qcmwx8u.jpg")),
    ("Bacon Cheese", "120 GR Beef Patty, Home made Brioche, Edam Cheese, Bacon, Ketchup, Lakwanaise", 599, local("/assets/img/menu/classic-burgers-bacon-cheese.jpg", "https://hwkydsigfcgbyiyukzbr.supabase.co/storage/v1/object/public/site-images/menu/mw1ti01qjtvn8.jpg")),
    ("Crispy Chicken", "150 GR Chicken Thigh Patty, Home made Brioche, IceBerg Lettuce, Ketchup, Lakwanaise", 699, local("/assets/img/menu/classic-burgers-crispy-chicken.jpg", "https://hwkydsigfcgbyiyukzbr.supabase.co/storage/v1/object/public/site-images/menu/mw1tjducqykek.jpg")),
    ("Double Cheese", "Two beef patties, double cheese, home made brioche.", 699, local("/assets/img/menu/classic-burgers-double-cheese.jpg", "")),
]
MARKUP = 0  # mirrors Settings → price increase (only used for the first paint; live prices load from the database)

MAIN_NAV = [
    ("Home", BASE + "/"), ("Order online", BASE + "/order/"), ("Earth School Community", BASE + "/community/"),
    ("My orders", BASE + "/orders/"),
]
TICKER = ["Dine in", "Order ahead", "Ride thru", "Home made brioche", "Lakwanaise on everything", "Lio Estate, El Nido"]

def public_price(base):
    import math
    return math.ceil(round(base * (1 + MARKUP / 100), 2))

def peso(n):
    return "₱{:,.0f}".format(n)

CUR = ' class="is-current"'
HIDDEN = ' aria-hidden="true"'

# ------------------------------------------------------------------ layout
def head(title, desc, noindex=False):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{E(title)}</title>
<meta name="description" content="{E(desc)}">
{'<meta name="robots" content="noindex, nofollow">' if noindex else ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="{E(SITE['brand'])}">
<meta property="og:title" content="{E(title)}">
<meta property="og:description" content="{E(desc)}">
<meta property="og:image" content="{SITE['hero'] if SITE['hero'].startswith('http') else 'https://lakwaburger.com' + SITE['hero']}">
<meta name="theme-color" content="#b10b0e">
<link rel="icon" href="{SITE['favicon']}">
<link rel="apple-touch-icon" href="{BASE}/assets/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@600;700&family=Space+Grotesk:wght@400;700&family=Unbounded:wght@700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{BASE}/assets/css/site.css?v={VER}">
</head>
"""

def header():
    nav = "\n".join(
        f'<a href="{E(h)}"{CUR if l == "Home" else ""}>{E(l)}</a>' for l, h in MAIN_NAV)
    return f"""<header class="site-header">
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="header-inner">
    <nav class="header-nav header-nav--left" aria-label="Cafe">
      <a href="{BASE}/order/">Order</a><a href="{BASE}/community/">Earth School Community</a><a href="{BASE}/orders/">My orders</a>
    </nav>
    <a href="{BASE}/" class="logo" aria-label="{E(SITE['name'])}">
      <img src="{SITE['logo']}" alt="{E(SITE['name'])}" onerror="this.remove()">
      <span class="logo-fallback">LAKWA</span>
    </a>
    <div class="header-actions">
      <a class="btn btn--cream header-cta" href="{BASE}/order/">Order</a>
      <button class="burger" aria-label="Open menu" aria-expanded="false" data-burger><span></span><span></span></button>
    </div>
  </div>
  <div class="menu-overlay" aria-hidden="true" data-overlay><nav aria-label="Lakwa">{nav}</nav></div>
</header>
"""

def footer():
    return f"""<footer id="visit" class="section section--teal footer">
  <div class="container">
    <div class="footer-cols">
      <div><p class="footer-label">Burger Cafe</p><p class="footer-links"><a href="{BASE}/order/">Order online</a><a href="{BASE}/orders/">My orders</a></p></div>
      <div><p class="footer-label">Social Media</p><p class="footer-links"><a href="{SITE['instagram']}" target="_blank" rel="noopener">Instagram</a><a href="{SITE['facebook']}" target="_blank" rel="noopener">Facebook</a></p></div>
      <div><p class="footer-label">Find us</p><p class="footer-links"><a href="{SITE['maps']}" target="_blank" rel="noopener">Directions</a><a href="{SITE['whatsapp']}" target="_blank" rel="noopener">WhatsApp</a></p></div>
    </div>
    <div class="footer-badge"><img src="{SITE['badge']}" alt="" loading="lazy" onerror="this.remove()"></div>
    <h4 class="display display--sm footer-brand">LAKWA</h4>
    <p>Copyright <span data-year>2026</span> LAKWA MOTORCYCLES</p>
    <address>{SITE['address'][0]}<br>{SITE['address'][1]}<br><a href="tel:{SITE['tel']}">{SITE['phone']}</a></address>
  </div>
</footer>
"""

def scripts(*names, supabase=True):
    s = []
    if supabase:
        s.append('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js"></script>')
    s.append(f'<script src="{BASE}/assets/js/config.js?v={VER}"></script>')
    s.append(f'<script src="{BASE}/assets/js/lakwa.js?v={VER}"></script>')
    s += [f'<script src="{BASE}/assets/js/{n}.js?v={VER}"></script>' for n in names]
    return "\n".join(s)

def page(path, title, desc, body, js=(), noindex=False, chrome=True, supabase=True):
    out = head(title, desc, noindex) + "<body>\n"
    if chrome:
        out += header() + body + footer()
    else:
        out += body
    out += scripts(*js, supabase=supabase) + "\n</body>\n</html>\n"
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(out)
    print("wrote", path)

# ------------------------------------------------------------------ pages
def page_home():
    cards = "\n".join(f"""<li class="menu-card">
  <div class="menu-card-img"><img src="{img}?format=750w" alt="{E(n)}" loading="lazy"></div>
  <div class="menu-card-body"><h3 class="menu-card-title">{E(n)}</h3><p class="menu-card-price">{peso(public_price(b))}</p><p class="menu-card-desc">{E(d)}</p></div>
</li>""" for n, d, b, img in MENU)
    ticker_row = lambda hidden: (f'<div class="ticker-row"{HIDDEN if hidden else ""}>' +
        "".join(f'<span class="ticker-item">{E(t)}<span class="ticker-star" aria-hidden="true">❋</span></span>' for t in TICKER) + "</div>")
    body = f"""<main id="main">
<section class="hero">
  <div class="hero-bg" style="background-image:url('{SITE['hero']}')" aria-hidden="true"></div>
  <div class="hero-shade" aria-hidden="true"></div>
  <div class="container hero-content">
    <h1 class="display display--xl">Dine, Order or Ride&nbsp;thru</h1>
    <div class="hero-actions"><a href="{BASE}/order/" class="btn btn--red">Order now</a><a href="#menu" class="btn btn--outline">See the menu</a></div>
  </div>
</section>
<section class="ticker" aria-label="Highlights"><div class="ticker-track">{ticker_row(False)}{ticker_row(True)}</div></section>
<section id="menu" class="section section--red menu">
  <div class="container">
    <div class="section-head"><p class="eyebrow">The Menu</p><h2 class="display display--md">Burgers &amp; bites</h2></div>
    <ul class="menu-grid" data-home-menu>
{cards}
    </ul>
    <div class="menu-cta"><a href="{BASE}/order/" class="btn btn--cream">Order online</a><p>Earth School Community member? Your member price is applied at checkout. <a href="{BASE}/community/">Request to join →</a></p></div>
  </div>
</section>
<section class="section section--teal feature">
  <div class="container feature-inner">
    <div><p class="eyebrow">Ride thru</p><h2 class="display display--md feature-title">Built for riders</h2></div>
    <p class="feature-copy">Coming off the trail or heading out on a tour? Roll up to the Lakwa Burger Cafe at Lio Estate and grab a burger on home made brioche, finished with our house Lakwanaise. Stay and eat, or take it with you.</p>
    <a href="{BASE}/order/" class="btn btn--red btn--block">Order ahead</a>
  </div>
</section>
<section id="about" class="section section--red about">
  <div class="container about-inner">
    <p class="eyebrow">About the Cafe</p>
    <p class="about-copy">The Lakwa Burger Cafe is the kitchen of Lakwa Motorcycle Tours in El Nido, Palawan. We keep it simple: beef and crispy chicken burgers on buns we bake ourselves, Edam cheese, and a sauce you'll only find here.</p>
    <a href="{SITE['maps']}" class="btn btn--teal btn--block" target="_blank" rel="noopener">Get directions</a>
  </div>
</section>
</main>
"""
    page("index.html", "Lakwa Burger Cafe | El Nido, Palawan",
         "Lakwa Burger Cafe in El Nido, Palawan. Dine in, order ahead or ride thru for burgers on home made brioche with Lakwanaise.",
         body, js=("home",))

def page_order():
    body = f"""<main id="main" class="page page--cream"><div class="container">
<div class="page-head"><p class="eyebrow">Order online</p><h1 class="display display--lg">Build your order</h1>
<p class="lede">Pay with GCash, upload your receipt, and we'll have it ready for dine in, pick up or ride thru. Earth School Community members: tick the box at checkout to get your member price. Not a member yet? <a href="{BASE}/community/">Request to join</a>.</p></div>
<div class="order-layout">
  <div class="order-menu-wrap">
    <div class="menu-tools" data-menu-tools hidden>
      <input type="search" class="menu-search" placeholder="Search the menu..." aria-label="Search the menu" autocomplete="off" data-search>
      <nav class="menu-chips" aria-label="Menu sections" data-chips></nav>
    </div>
    <div class="order-menu" data-menu><p class="muted">Loading the menu...</p></div>
  </div>
  <form id="checkout" class="checkout card" data-checkout novalidate>
    <h2 class="display display--sm">Your order</h2>
    <div data-cart><p class="muted">Your cart is empty. Add something tasty.</p></div>
    <fieldset class="member-box">
      <label class="check"><input type="checkbox" data-member-toggle> I'm an Earth School Community member</label>
      <div class="member-fields" data-member-fields hidden>
        <input type="email" placeholder="Member email" autocomplete="email" data-m-email>
        <input type="password" inputmode="numeric" placeholder="Passcode" autocomplete="current-password" data-m-pass>
        <button type="button" class="btn btn--teal" data-m-apply>Apply</button>
        <p class="err" data-m-msg hidden></p>
      </div>
      <p class="ok" data-m-ok hidden></p>
    </fieldset>
    <div class="fields">
      <label>Name<input name="name" required autocomplete="name"></label>
      <label>Mobile number<input name="phone" type="tel" required autocomplete="tel" placeholder="09xx xxx xxxx"></label>
      <label data-email-row>Email (for your receipt)<input name="email" type="email" required autocomplete="email"></label>
      <div class="seg" role="radiogroup" aria-label="How will you get your order?">
        <label><input type="radio" name="fulfillment" value="dine_in"> Dine in</label>
        <label class="on"><input type="radio" name="fulfillment" value="pickup" checked> Pick up</label>
        <label><input type="radio" name="fulfillment" value="ride_thru"> Ride thru</label>
      </div>
      <label>Notes (optional)<textarea name="notes" rows="2" placeholder="No lettuce, extra Lakwanaise, ETA..."></textarea></label>
    </div>
    <dl class="totals" data-totals></dl>
    <p class="err" role="alert" data-error hidden></p>
    <button class="btn btn--red btn--block" data-submit disabled>Checkout · Pay with GCash</button>
    <p class="muted small" data-hint hidden></p>
  </form>
  <a href="#checkout" class="cart-bar" data-cart-bar hidden></a>
</div>
</div></main>
"""
    page("order/index.html", "Order | Lakwa Burger Cafe", "Order burgers online from the Lakwa Burger Cafe, El Nido. Pay with GCash.",
         body, js=("order",))

def page_order_view():
    body = """<main id="main" class="page page--cream"><div class="container narrow" data-order-view>
<p class="muted">Loading your order...</p>
</div></main>
"""
    page("order/view/index.html", "Your order | Lakwa Burger Cafe", "Your Lakwa Burger Cafe order.", body,
         js=("order-view",), noindex=True)

def page_orders():
    body = """<main id="main" class="page page--cream"><div class="container narrow">
<div class="page-head"><p class="eyebrow">Order history</p><h1 class="display display--lg">My orders</h1>
<p class="lede">Earth School Community members: sign in with your email and passcode to see every order. Ordered as a guest? Use the link in your order email.</p></div>
<div data-history>
<form class="card fields narrow-form" data-history-form>
  <label>Member email<input name="email" type="email" required autocomplete="email"></label>
  <label>Passcode<input name="passcode" type="password" inputmode="numeric" required autocomplete="current-password"></label>
  <p class="err" role="alert" data-error hidden></p>
  <button class="btn btn--red btn--block">View my orders</button>
</form>
</div>
</div></main>
"""
    page("orders/index.html", "My orders | Lakwa Burger Cafe", "Order history for registered customers.", body,
         js=("orders",), noindex=True)

def page_staff():
    body = f"""<div class="staff">
<div class="staff-login" data-login hidden>
  <form class="card fields" data-login-form>
    <p class="eyebrow">Lakwa Burger Cafe</p>
    <h1 class="display display--sm">Staff sign in</h1>
    <label>Email<input name="email" type="email" required autocomplete="username"></label>
    <label>Password<input name="password" type="password" required autocomplete="current-password"></label>
    <p class="err" role="alert" data-error hidden></p>
    <button class="btn btn--red btn--block">Sign in</button>
  </form>
</div>
<div data-app hidden>
  <header class="staff-bar">
    <a href="#orders" class="staff-brand">LAKWA <span>Staff</span></a>
    <nav data-staff-nav>
      <a href="#today">Today</a><a href="#orders">Orders</a><a href="#board">Board</a><a href="#payments">Payments <span class="badge" data-pay-badge hidden></span></a><a href="#community">Earth School Community <span class="badge" data-req-badge hidden></span></a>
      <a href="#menu" data-admin>Menu &amp; prices</a><a href="#settings" data-admin>Settings</a>
      <a href="{BASE}/" target="_blank" rel="noopener">View site ↗</a>
    </nav>
    <button class="store-toggle" data-store hidden></button>
    <div class="staff-user"><span data-who></span><button class="link" data-signout>Sign out</button></div>
  </header>
  <main class="staff-main" data-view><p class="muted">Loading...</p></main>
</div>
</div>
"""
    page("staff/index.html", "Staff | Lakwa Burger Cafe", "Staff dashboard.", body, js=("staff",), noindex=True, chrome=False)

def page_community():
    body = f"""<main id="main" class="page page--cream"><div class="container narrow">
<div class="page-head"><p class="eyebrow">Lakwa Burger Cafe</p><h1 class="display display--lg">Earth School Community</h1>
<p class="lede">Members of Earth School Community get a community price. It's reflected in your orders automatically
when you check out with your member email and passcode. Send us your details and our team will review your request.
Once you're approved, we'll email you a passcode to use at checkout.</p></div>
<div data-community>
<form class="card fields narrow-form" data-community-form novalidate>
  <label>Full name<input name="name" required autocomplete="name"></label>
  <label>Email<input name="email" type="email" required autocomplete="email"></label>
  <label>Mobile number<input name="phone" type="tel" required autocomplete="tel" placeholder="09xx xxx xxxx"></label>
  <label>Which best describes you in the Earth School community?
    <select name="community_role" required>
      <option value="">Choose your role</option>
      <option value="Parent of a student">Parent of a student</option>
      <option value="Student">Student</option>
      <option value="Kalye Artisano tenant">Kalye Artisano tenant</option>
    </select>
  </label>
  <p class="err" role="alert" data-error hidden></p>
  <button class="btn btn--red btn--block">Request to join</button>
</form>
<p class="muted small">Already a member? Just order and tick "I'm an Earth School Community member" at checkout. Lost your passcode? Call or text {SITE['phone']}.</p>
</div>
</div></main>
"""
    page("community/index.html", "Earth School Community | Lakwa Burger Cafe",
         "Join Earth School Community at the Lakwa Burger Cafe in El Nido and get a community price on your orders.", body, js=("community",))

def page_board():
    # The screen at the cashier. Big numbers, no names; staff move orders in /staff/#board.
    body = f"""<div class="board" data-board>
<header class="board-bar">
  <div class="board-brand">LAKWA <span>Burger Cafe</span></div>
  <div class="board-clock" data-clock></div>
</header>
<main class="board-cols">
  <section class="board-col board-col--in">
    <h1 class="board-title">Incoming <span>Awaiting payment</span></h1>
    <ul class="board-nums" data-in></ul>
  </section>
  <section class="board-col board-col--prep">
    <h1 class="board-title">Preparing</h1>
    <ul class="board-nums" data-prep></ul>
  </section>
  <section class="board-col board-col--ready">
    <h1 class="board-title">Ready <span>Please collect</span></h1>
    <ul class="board-nums" data-ready></ul>
  </section>
</main>
<footer class="board-foot">
  <span>Order ahead online: <b data-order-url></b></span>
  <span class="board-status" data-status></span>
</footer>
<button class="board-start" data-start>Tap for sound &amp; full screen</button>
</div>
"""
    page("board/index.html", "Order board | Lakwa Burger Cafe", "Order status board.", body,
         js=("board",), noindex=True, chrome=False)

def page_404():
    body = f"""<main id="main" class="page page--cream"><div class="container narrow">
<div class="page-head"><p class="eyebrow">404</p><h1 class="display display--lg">Wrong turn</h1>
<p class="lede">That page doesn't exist. <a href="{BASE}/">Back to the Burger Cafe</a>.</p></div></div></main>
"""
    page("404.html", "Not found | Lakwa Burger Cafe", "Page not found.", body, supabase=False)

if __name__ == "__main__":
    page_home(); page_order(); page_order_view(); page_orders(); page_community(); page_staff(); page_board(); page_404()
