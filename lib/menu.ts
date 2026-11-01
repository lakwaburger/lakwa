import { getSupabase } from "./supabase";

export type MenuItem = {
  id: string;
  slug: string;
  name: string;
  description: string;
  base_price: number;
  image_url: string | null;
  category: string;
  sort_order: number;
};

export type PublicSettings = {
  markup_pct: number;
  gcash_name: string;
  gcash_number: string;
  gcash_qr_url: string | null;
  accepting_orders: boolean;
};

const CDN = "https://images.squarespace-cdn.com/content/v1/66ee374b9956fe4e4593e2cc";

export const DEFAULT_SETTINGS: PublicSettings = {
  markup_pct: 20,
  gcash_name: "LAKWA MOTORCYCLES",
  gcash_number: "0931 154 9766",
  gcash_qr_url: null,
  accepting_orders: true,
};

// Shown when Supabase isn't configured yet, so the homepage always renders.
// Mirrors supabase/seed.sql (Cheese ₱249 is real; the rest are stand-ins).
export const FALLBACK_MENU: MenuItem[] = [
  {
    id: "cheese",
    slug: "cheese",
    name: "Cheese",
    description: "120 GR. Beef Patty, home made brioche, Edam cheese, Ketchup and Lakwanaise.",
    base_price: 249,
    image_url: `${CDN}/2367956d-de03-40e6-ab71-cf893bb9dd0d/cheeseburegr.jpg`,
    category: "Burgers",
    sort_order: 1,
  },
  {
    id: "bacon-cheese",
    slug: "bacon-cheese",
    name: "Bacon Cheese",
    description: "120 GR Beef Patty, Home made Brioche, Edam Cheese, Bacon, Ketchup, Lakwanaise",
    base_price: 289,
    image_url: `${CDN}/6af2c29a-a075-4f87-accc-b6088e4961e0/baconburger.jpg`,
    category: "Burgers",
    sort_order: 2,
  },
  {
    id: "crispy-chicken",
    slug: "crispy-chicken",
    name: "Crispy Chicken",
    description: "150 GR Chicken Thigh Patty, Home made Brioche, IceBerg Lettuce, Ketchup, Lakwanaise",
    base_price: 269,
    image_url: `${CDN}/8fa4c3e6-25f3-4851-899f-f2d5eb9d4612/chiken.jpg`,
    category: "Burgers",
    sort_order: 3,
  },
  {
    id: "mozzarella-fingers",
    slug: "mozzarella-fingers",
    name: "Mozzarella Fingers",
    description: "Fried Breaded Mozzarella Sticks",
    base_price: 189,
    image_url: `${CDN}/30479f6d-31ce-4906-9ac3-adb5d10c35bb/cheesesticks.jpg`,
    category: "Sides",
    sort_order: 4,
  },
];

export async function getMenu(): Promise<{
  items: MenuItem[];
  settings: PublicSettings;
  source: "supabase" | "fallback";
}> {
  const supabase = getSupabase();
  if (!supabase) return { items: FALLBACK_MENU, settings: DEFAULT_SETTINGS, source: "fallback" };

  const [menu, settings] = await Promise.all([
    supabase
      .from("menu_items")
      .select("id, slug, name, description, base_price, image_url, category, sort_order")
      .eq("is_available", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("settings")
      .select("markup_pct, gcash_name, gcash_number, gcash_qr_url, accepting_orders")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  if (menu.error) console.error("[menu] Supabase error, using fallback:", menu.error.message);
  const items =
    !menu.error && menu.data && menu.data.length
      ? menu.data.map((m) => ({ ...m, base_price: Number(m.base_price) }))
      : FALLBACK_MENU;
  const s = settings.data
    ? { ...settings.data, markup_pct: Number(settings.data.markup_pct) }
    : DEFAULT_SETTINGS;
  return { items, settings: s, source: items === FALLBACK_MENU ? "fallback" : "supabase" };
}

/** Squarespace CDN images accept ?format=<width>w for resizing. */
export function sized(url: string | null, width: number) {
  if (!url) return null;
  if (url.includes("squarespace-cdn.com") && !url.includes("format=")) return `${url}?format=${width}w`;
  return url;
}
