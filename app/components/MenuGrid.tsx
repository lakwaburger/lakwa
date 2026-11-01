import { sized, type MenuItem } from "@/lib/menu";
import { publicPrice, peso } from "@/lib/pricing";

export default function MenuGrid({ items, markup }: { items: MenuItem[]; markup: number }) {
  return (
    <section id="menu" className="section section--red menu">
      <div className="container">
        <div className="section-head">
          <p className="eyebrow">The Menu</p>
          <h2 className="display display--md">Burgers &amp; bites</h2>
        </div>
        <ul className="menu-grid">
          {items.map((item) => {
            const price = peso(publicPrice(item.base_price, markup));
            return (
              <li key={item.id} className="menu-card">
                <div className="menu-card-img">
                  {item.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sized(item.image_url, 750)!} alt={item.name} loading="lazy" />
                  )}
                </div>
                <div className="menu-card-body">
                  <h3 className="menu-card-title">{item.name}</h3>
                  {price && <p className="menu-card-price">{price}</p>}
                  <p className="menu-card-desc">{item.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="menu-cta">
          <a href="/order" className="btn btn--cream">Order online</a>
          <p>Registered customer? Your member price is applied at checkout.</p>
        </div>
      </div>
    </section>
  );
}
