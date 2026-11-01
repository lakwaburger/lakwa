import { MAIN_SITE, site } from "@/lib/site";

export default function Footer() {
  return (
    <footer id="visit" className="section section--teal footer">
      <div className="container">
        <div className="footer-cols">
          <div>
            <p className="footer-label">Company</p>
            <p className="footer-links">
              <a href={`${MAIN_SITE}/about`}>About us</a>
              <a href={`${MAIN_SITE}/contact-us`}>Contact us</a>
            </p>
          </div>
          <div>
            <p className="footer-label">Social Media</p>
            <p className="footer-links">
              <a href={site.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>
              <a href={site.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>
            </p>
          </div>
          <div>
            <p className="footer-label">Find us</p>
            <p className="footer-links">
              <a href={site.mapsUrl} target="_blank" rel="noopener noreferrer">Directions</a>
              <a href={site.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            </p>
          </div>
        </div>

        <div className="footer-badge">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={site.footerImage} alt="" loading="lazy" />
        </div>

        <h4 className="display display--sm footer-brand">LAKWA</h4>
        <p>Copyright {new Date().getFullYear()} LAKWA MOTORCYCLES</p>
        <address>
          {site.address[0]}
          <br />
          {site.address[1]}
          <br />
          <a href={`tel:${site.phoneTel}`}>{site.phoneDisplay}</a>
        </address>
      </div>
    </footer>
  );
}
