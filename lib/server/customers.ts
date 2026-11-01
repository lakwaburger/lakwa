import "server-only";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { requireAdmin } from "./admin";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export type Member = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  extra_discount_pct: number;
};

/** 6-digit numeric passcode — easy to type on a phone; brute force is blocked by the lockout below. */
export function generatePasscode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashPasscode(passcode: string) {
  return bcrypt.hash(passcode, 10);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Checks a registered customer's email + passcode.
 * Locks the account for 15 minutes after 5 wrong passcodes.
 */
export async function verifyMember(
  emailRaw: string,
  passcodeRaw: string,
): Promise<{ ok: true; member: Member } | { ok: false; error: string }> {
  const email = normalizeEmail(emailRaw);
  const passcode = passcodeRaw.trim();
  if (!email || !passcode) return { ok: false, error: "Enter your registered email and passcode." };

  const db = requireAdmin();
  const { data: c } = await db
    .from("customers")
    .select("id, email, full_name, phone, extra_discount_pct, passcode_hash, is_active, failed_attempts, locked_until")
    .eq("email", email)
    .maybeSingle();

  const generic = "That email and passcode don't match a registered customer.";
  if (!c || !c.is_active) return { ok: false, error: generic };

  if (c.locked_until && new Date(c.locked_until) > new Date()) {
    return { ok: false, error: `Too many attempts. Try again after ${LOCK_MINUTES} minutes or ask staff to unlock.` };
  }

  const match = await bcrypt.compare(passcode, c.passcode_hash);
  if (!match) {
    const attempts = (c.failed_attempts ?? 0) + 1;
    await db
      .from("customers")
      .update({
        failed_attempts: attempts >= MAX_ATTEMPTS ? 0 : attempts,
        locked_until: attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      })
      .eq("id", c.id);
    return { ok: false, error: generic };
  }

  if (c.failed_attempts) await db.from("customers").update({ failed_attempts: 0, locked_until: null }).eq("id", c.id);

  return {
    ok: true,
    member: {
      id: c.id,
      email: c.email,
      full_name: c.full_name,
      phone: c.phone,
      extra_discount_pct: Number(c.extra_discount_pct),
    },
  };
}
