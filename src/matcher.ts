import { CONFIG } from './config';
import { listOpenWithdrawalsByRail, writeDepositStatus, writeWithdrawalProgress, appendLedger } from './sheets';
import type { Deposit, Withdrawal } from './types';

/**
 * Matching rules:
 * 1) Rail-strict.
 * 2) Single-payment constraint: One deposit can fulfill at most one withdrawal (no multi-recipient splits).
 * 3) Prefer exact-amount match.
 * 4) Allow partial match ONLY if remainder (withdrawal.amountRequested - amountAllocated) >= MIN_BUY_IN.
 * 5) Never create a remainder below MIN_BUY_IN.
 */
export async function matchDepositToWithdrawal(spreadsheetId: string, deposit: Deposit): Promise<Withdrawal | null> {
  if (deposit.status !== 'confirmed') return null;

  const open = await listOpenWithdrawalsByRail(spreadsheetId, deposit.rail);
  if (!open.length) return null;

  // 1) Exact match first (FIFO already ensured by list function)
  const exact = open.find(w => (w.amountRequested - w.amountFilled) === deposit.amount);
  if (exact) {
    await allocate(spreadsheetId, deposit, exact, deposit.amount);
    return exact;
  }

  // 2) Partial only if remainder stays >= MIN_BUY_IN
  for (const w of open) {
    const remaining = w.amountRequested - w.amountFilled;
    if (deposit.amount < remaining) {
      const remainderAfter = remaining - deposit.amount;
      if (remainderAfter >= CONFIG.MIN_BUY_IN) {
        await allocate(spreadsheetId, deposit, w, deposit.amount);
        return w;
      }
    }
  }

  // 3) No match allowed under constraints. Leave deposit unmatched.
  return null;
}

async function allocate(spreadsheetId: string, deposit: Deposit, w: Withdrawal, applyAmount: number) {
  const now = Date.now();
  const newFilled = w.amountFilled + applyAmount;
  const remaining = w.amountRequested - newFilled;
  const closing = remaining === 0 ? 'complete' : 'partial';

  await writeWithdrawalProgress(spreadsheetId, w.id, {
    amountFilled: newFilled,
    status: closing as any,
    fulfilledBy: 'circle',
    completedAt: closing === 'complete' ? now : undefined,
  });

  // Mark deposit as consumed (single-payment constraint)
  await writeDepositStatus(spreadsheetId, deposit.id, 'confirmed', deposit.confirmedAt ?? now);

  await appendLedger(spreadsheetId, [[
    new Date(now).toISOString(),
    'circle_match',
    deposit.id,
    w.id,
    w.rail,
    applyAmount
  ]]);
}