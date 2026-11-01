// Shared site info. When this microsite merges into lakwamotorcycles.com,
// MAIN_SITE can become "" so these links turn into internal routes.
export const MAIN_SITE = "https://lakwamotorcycles.com";

const CDN = "https://images.squarespace-cdn.com/content/v1/66ee374b9956fe4e4593e2cc";

export const site = {
  name: "Lakwa Burger Cafe",
  brand: "Lakwa Motorcycle Tours",
  logo: `${CDN}/8984bcaf-9fff-45b9-aeee-f2c6c766cd3e/Untitled-7.png?format=500w`,
  heroImage: `${CDN}/a81a023e-2415-4f00-af1a-0247f41efcbc/edbae927-58c6-469e-80a1-fb893f9cd834.jpg?format=2500w`,
  footerImage: `${CDN}/d45edc45-997f-4687-b370-a41c37ddd510/580b57fcd9996e24bc43c543.png?format=300w`,
  favicon: `${CDN}/9472beb5-5b7e-4ed1-9041-5f9f8ebf079c/favicon.ico`,
  address: ["Kalye Artisano, Lio Estate", "Villa Libertad, El Nido, Palawan 5315"],
  phoneDisplay: "(0931) 154-9766",
  phoneTel: "+639311549766",
  whatsapp: "https://wa.me/639311549766",
  instagram: "https://www.instagram.com/lakwamotorcycles/",
  facebook: "https://www.facebook.com/lakwatseromotorcycles",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent("Kalye Artisano, Lio Estate, Villa Libertad, El Nido, Palawan"),
};

export const mainNav = [
  { label: "Home", href: `${MAIN_SITE}/` },
  { label: "Enduro", href: `${MAIN_SITE}/tours` },
  { label: "ADVenture", href: `${MAIN_SITE}/adv-tours` },
  { label: "VLOG", href: `${MAIN_SITE}/moto-blog-2` },
  { label: "Maps", href: `${MAIN_SITE}/lakwa-packages` },
  { label: "Motel", href: `${MAIN_SITE}/motel` },
  { label: "Burger Cafe", href: "/", current: true },
  { label: "Order online", href: "/order" },
  { label: "My orders", href: "/orders" },
  { label: "+ More to do", href: "https://www.lakwaexperiences.com/" },
  { label: "About", href: `${MAIN_SITE}/about` },
];

export const tickerItems = [
  "Dine in",
  "Order ahead",
  "Ride thru",
  "Home made brioche",
  "Lakwanaise on everything",
  "Lio Estate, El Nido",
];
