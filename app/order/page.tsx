import type { Metadata } from "next";
import Header from "../components/Header";
import Footer from "../components/Footer";
import OrderClient from "./OrderClient";
import { getMenu } from "@/lib/menu";
import { getAdmin } from "@/lib/server/admin";

export const metadata: Metadata = { title: "Order — Lakwa Burger Cafe" };
export const dynamic = "force-dynamic";

export default async function OrderPage() {
  const { items, settings } = await getMenu();
  const enabled = !!getAdmin() && settings.accepting_orders;

  return (
    <>
      <Header />
      <main id="main" className="page page--cream">
        <div className="container">
          <div className="page-head">
            <p className="eyebrow">Order online</p>
            <h1 className="display display--lg">Build your order</h1>
            <p className="lede">
              Pay with GCash, upload your receipt, and we&apos;ll have it ready for dine in, pick up or ride thru.
              Registered customers: tick the box at checkout to get your member price.
            </p>
          </div>
          <OrderClient items={items} markup={settings.markup_pct} enabled={enabled} />
        </div>
      </main>
      <Footer />
    </>
  );
}
