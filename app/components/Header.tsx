"use client";

import { useEffect, useState } from "react";
import { mainNav, site } from "@/lib/site";

export default function Header() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="site-header">
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="header-inner">
        <nav className="header-nav header-nav--left" aria-label="Cafe">
          <a href="/#menu">Menu</a>
          <a href="/order">Order</a>
          <a href="/orders">My orders</a>
        </nav>

        <a href="/" className="logo" aria-label={site.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={site.logo} alt={site.brand} onError={(e) => (e.currentTarget.style.display = "none")} />
          <span className="logo-fallback">LAKWA</span>
        </a>

        <div className="header-actions">
          <a className="btn btn--cream header-cta" href="/order">Order</a>
          <button
            className={`burger ${open ? "is-open" : ""}`}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>

      <div className={`menu-overlay ${open ? "is-open" : ""}`} aria-hidden={!open}>
        <nav aria-label="Lakwa">
          {mainNav.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={item.current ? "is-current" : undefined}
              onClick={() => setOpen(false)}
              tabIndex={open ? 0 : -1}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
