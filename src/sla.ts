import { CONFIG } from './config';
import { listOpenWithdrawalsByRail, markWithdrawalTreasuryPaid } from './sheets';

/**
 * Sweep all rails for withdrawals older than the 24h SLA and mark them as treasury paid.
 * Call this on a schedule (e.g., setInterval or a cron runner).
 */
export async function runWithdrawalSLA(spreadsheetId: string, rails: string[]) {
  const now = Date.now();
  for (const rail of rails) {
    const open = await listOpenWithdrawalsByRail(spreadsheetId, rail);
    for (const w of open) {
      if (now - w.createdAt >= CONFIG.WITHDRAWAL_SLA_MS) {
        await markWithdrawalTreasuryPaid(spreadsheetId, w);
      }
    }
  }
}
