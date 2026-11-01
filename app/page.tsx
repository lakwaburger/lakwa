import Header from "./components/Header";
import Ticker from "./components/Ticker";
import MenuGrid from "./components/MenuGrid";
import Footer from "./components/Footer";
import { getMenu } from "@/lib/menu";
import { site } from "@/lib/site";

// Re-fetch the menu from Supabase at most once a minute.
export const revalidate = 60;

export default async function Home() {
  const { items, settings } = await getMenu();

  return (
    <>
      <Header />
      <main id="main">
        {/* Hero */}
        <section className="hero">
          <div className="hero-bg" style={{ backgroundImage: `url(${site.heroImage})` }} aria-hidden />
          <div className="hero-shade" aria-hidden />
          <div className="container hero-content">
            <h1 className="display display--xl">Dine, Order or Ride&nbsp;thru</h1>
            <div className="hero-actions">
              <a href="/order" className="btn btn--red">Order now</a>
              <a href="#menu" className="btn btn--outline">See the menu</a>
            </div>
          </div>
        </section>

        <Ticker />

        <MenuGrid items={items} markup={settings.markup_pct} />

        {/* Feature (replaces the template "Sand Collection" block) */}
        <section className="section section--teal feature">
          <div className="container feature-inner">
            <div>
              <p className="eyebrow">Ride thru</p>
              <h2 className="display display--md feature-title">Built for riders</h2>
            </div>
            <p className="feature-copy">
              Coming off the trail or heading out on a tour? Roll up to the Lakwa Burger Cafe at Lio
              Estate and grab a burger on home made brioche, finished with our house Lakwanaise.
              Stay and eat, or take it with you.
            </p>
            <a href="/order" className="btn btn--red btn--block">Order ahead</a>
          </div>
        </section>

        {/* About (replaces the template "About the Collection" block) */}
        <section id="about" className="section section--red about">
          <div className="container about-inner">
            <p className="eyebrow">About the Cafe</p>
            <p className="about-copy">
              The Lakwa Burger Cafe is the kitchen of Lakwa Motorcycle Tours in El Nido, Palawan. We
              keep it simple: beef and crispy chicken burgers on buns we bake ourselves, Edam cheese,
              and a sauce you&apos;ll only find here.
            </p>
            <a href={site.mapsUrl} className="btn btn--teal btn--block" target="_blank" rel="noopener noreferrer">
              Get directions
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
