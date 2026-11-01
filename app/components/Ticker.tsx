import { tickerItems } from "@/lib/site";

export default function Ticker() {
  const row = (hidden: boolean) => (
    <div className="ticker-row" aria-hidden={hidden || undefined}>
      {tickerItems.map((t) => (
        <span key={t} className="ticker-item">
          {t}
          <span className="ticker-star" aria-hidden>❋</span>
        </span>
      ))}
    </div>
  );
  return (
    <section className="ticker" aria-label="Highlights">
      <div className="ticker-track">
        {row(false)}
        {row(true)}
      </div>
    </section>
  );
}
