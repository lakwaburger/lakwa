import "server-only";
import { requireAdmin } from "./admin";
import type { PaymentRow } from "@/app/staff/(app)/PaymentReview";

type RawPayment = Omit<PaymentRow, "proofUrl" | "duplicate"> & { proof_path: string; order_id: string };

/** Adds a short-lived signed URL for the receipt and a duplicate-reference flag. */
export async function enrichPayments(rows: RawPayment[]): Promise<(PaymentRow & { order_id: string })[]> {
  if (!rows.length) return [];
  const db = requireAdmin();
  const refs = [...new Set(rows.map((r) => r.gcash_ref))];
  const { data: same } = await db.from("payments").select("id, order_id, gcash_ref").in("gcash_ref", refs).neq("status", "rejected");
  const signed = await db.storage.from("payment-proofs").createSignedUrls(rows.map((r) => r.proof_path), 60 * 15);

  return rows.map((r, i) => ({
    ...r,
    amount: Number(r.amount),
    proofUrl: signed.data?.[i]?.signedUrl ?? null,
    duplicate: (same || []).some((s) => s.gcash_ref === r.gcash_ref && s.order_id !== r.order_id),
  }));
}
