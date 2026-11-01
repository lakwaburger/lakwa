// Pricing rules (shared by server and client; the server is always authoritative).
//
//   public price  = base price + markup (default 20%), rounded UP to the whole peso
//   member price  = base price (the pre-increase price), minus any extra % staff set
//
// So registered customers "don't feel" the increase; everyone else pays the new price.

export function publicPrice(base: number, markupPct: number) {
  return Math.ceil(round2(base * (1 + markupPct / 100)));
}

export function memberPrice(base: number, extraDiscountPct = 0) {
  return Math.round(base * (1 - extraDiscountPct / 100));
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type PricedLine = {
  menu_item_id: string;
  name: string;
  qty: number;
  unit_price: number; // public
  charged_unit_price: number;
  line_total: number;
};

export function priceOrder(
  lines: { menu_item_id: string; name: string; base_price: number; qty: number }[],
  markupPct: number,
  member: { extra_discount_pct: number } | null,
) {
  const priced: PricedLine[] = lines.map((l) => {
    const unit = publicPrice(l.base_price, markupPct);
    const charged = member ? memberPrice(l.base_price, member.extra_discount_pct) : unit;
    return {
      menu_item_id: l.menu_item_id,
      name: l.name,
      qty: l.qty,
      unit_price: unit,
      charged_unit_price: charged,
      line_total: charged * l.qty,
    };
  });
  const subtotal = priced.reduce((s, l) => s + l.unit_price * l.qty, 0);
  const total = priced.reduce((s, l) => s + l.line_total, 0);
  return { lines: priced, subtotal, discount: subtotal - total, total };
}

export function peso(n: number | null | undefined) {
  if (n == null) return "";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

export const FULFILLMENT_LABEL: Record<string, string> = {
  dine_in: "Dine in",
  pickup: "Pick up",
  ride_thru: "Ride thru",
};

export const STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Awaiting payment",
  payment_submitted: "Payment submitted",
  paid: "Paid",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};
