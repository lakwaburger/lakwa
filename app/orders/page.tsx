import type { Metadata } from "next";
import Header from "../components/Header";
import Footer from "../components/Footer";
import HistoryClient from "./HistoryClient";

export const metadata: Metadata = { title: "My orders — Lakwa Burger Cafe", robots: { index: false } };

export default function OrdersPage() {
  return (
    <>
      <Header />
      <main id="main" className="page page--cream">
        <div className="container narrow">
          <div className="page-head">
            <p className="eyebrow">Order history</p>
            <h1 className="display display--lg">My orders</h1>
            <p className="lede">
              Registered customers: sign in with your email and passcode to see every order. Ordered as a guest? Use the
              link in your order email.
            </p>
          </div>
          <HistoryClient />
        </div>
      </main>
      <Footer />
    </>
  );
}
