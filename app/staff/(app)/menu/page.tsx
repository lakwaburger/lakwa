import { requireAdmin } from "@/lib/server/admin";
import { requireStaff } from "@/lib/server/staff-auth";
import { saveMenuItem } from "../../actions";
import { publicPrice, memberPrice, peso } from "@/lib/pricing";

type Item = {
  id: string;
  name: string;
  description: string;
  base_price: number;
  category: string;
  sort_order: number;
  image_url: string | null;
  is_available: boolean;
};

function ItemForm({ item, markup }: { item?: Item; markup: number }) {
  const base = Number(item?.base_price ?? 0);
  return (
    <form action={saveMenuItem} className="card fields grid-form menu-edit">
      <input type="hidden" name="id" value={item?.id ?? ""} />
      <label>Name<input name="name" required defaultValue={item?.name} /></label>
      <label>Category<input name="category" defaultValue={item?.category ?? "Burgers"} /></label>
      <label>
        Base price (₱) — pre-increase
        <input name="base_price" type="number" min={0} step="1" required defaultValue={item ? base : ""} />
        {item && (
          <span className="hint">
            Public pays <b>{peso(publicPrice(base, markup))}</b> (+{markup}%) · Members pay <b>{peso(memberPrice(base))}</b>
          </span>
        )}
      </label>
      <label>Sort order<input name="sort_order" type="number" defaultValue={item?.sort_order ?? 99} /></label>
      <label className="full">Description<input name="description" defaultValue={item?.description} /></label>
      <label className="full">Image URL<input name="image_url" defaultValue={item?.image_url ?? ""} /></label>
      <label className="check"><input type="checkbox" name="is_available" defaultChecked={item?.is_available ?? true} /> Available</label>
      <div><button className="btn btn--red">{item ? "Save" : "Add item"}</button></div>
    </form>
  );
}

export default async function StaffMenu() {
  await requireStaff({ admin: true });
  const db = requireAdmin();
  const [{ data: items }, { data: settings }] = await Promise.all([
    db.from("menu_items").select("*").order("sort_order"),
    db.from("settings").select("markup_pct").eq("id", 1).single(),
  ]);
  const markup = Number(settings?.markup_pct ?? 20);

  return (
    <>
      <div className="staff-head">
        <h1>Menu &amp; prices</h1>
        <p className="muted">
          Enter each item&apos;s <b>base price</b> (what it cost before the increase). The public price adds {markup}% automatically
          (change the % in Settings). Registered customers keep paying the base price.
        </p>
      </div>
      {(items as Item[] | null)?.map((it) => <ItemForm key={it.id} item={it} markup={markup} />)}
      <h2 className="sub">Add a new item</h2>
      <ItemForm markup={markup} />
    </>
  );
}
