import type { Metadata, Viewport } from "next";
import "@fontsource/jost/600.css";
import "@fontsource/jost/700.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/unbounded/700.css";
import "./globals.css";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Burger Cafe — Lakwa Motorcycle Tours",
  description:
    "Lakwa Burger Cafe in El Nido, Palawan. Dine in, order ahead or ride thru for burgers on home made brioche with Lakwanaise.",
  icons: { icon: site.favicon },
  openGraph: {
    title: "Burger Cafe — Lakwa Motorcycle Tours",
    siteName: "Lakwa Motorcycle Tours",
    type: "website",
    images: [site.heroImage],
  },
};

export const viewport: Viewport = { themeColor: "#b10b0e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
