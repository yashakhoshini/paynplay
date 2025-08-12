import type { MatchResult, OwnerAccount, CashoutRow, Method } from "./types.js";
import { listPendingCashouts } from "./sheets.js";

export async function findMatch(method: Method, amount: number, owners: OwnerAccount[], ownerThreshold: number): Promise<MatchResult> {
  // business rule v1:
  // - Only match when buy-in amount EXACTLY equals the top priority cashout amount (no split/overpay).
  // - Priority: FAST first (oldest requested_at first), then NORMAL (oldest first).
  const pending = await listPendingCashouts(method);
  const sorted = pending.sort((a, b) => {
    if (a.priority_type !== b.priority_type) return a.priority_type === "FAST" ? -1 : 1;
    return (a.requested_at || "").localeCompare(b.requested_at || "");
  });
  const candidate = sorted.find(c => c.amount === amount);

  if (!candidate) {
    // fallback to owner if no exact match
    const owner = owners.find(o => o.method === method);
    if (!owner) throw new Error(`No owner account configured for ${method}`);
    return { type: "OWNER", method, owner, amount };
  }

  // Ensure amount not less than requested (we only matched exact)
  return { type: "CASHOUT", cashout: candidate, amount };
}
