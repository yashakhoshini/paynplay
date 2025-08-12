import { getOpenCashouts, markCashoutMatchedByRow } from './sheets.js';
import { OWNER_FALLBACK_THRESHOLD } from './config.js';
import { MatchResult, OwnerAccount, Method } from './types.js';

export async function findMatch(
  method: string,
  amount: number,
  owners: OwnerAccount[],
  ownerThreshold: number = OWNER_FALLBACK_THRESHOLD
): Promise<MatchResult> {

  // 1) Try to match an exact cash-out in the sheet (FAST first handled externally in future)
  const cashouts = await getOpenCashouts();

  // sort: for now, oldest first (by row order) — you can evolve this to use Timestamp if present
  for (const co of cashouts) {
    if (co.method === method && co.amount === amount) {
      // mark matched
      await markCashoutMatchedByRow(co.rowIndex, 'matched');
      return { 
        type: 'CASHOUT', 
        cashout: {
          cashout_id: co.rowIndex.toString(),
          tg_user_id: '',
          display_name: co.username || '',
          method: co.method as Method,
          amount: co.amount,
          priority_type: 'NORMAL',
          status: 'MATCHED',
          requested_at: new Date().toISOString(),
          matched_at: new Date().toISOString(),
          payer_tg_user_id: '',
          payer_handle: '',
          receiver_handle: co.receiver_handle || '',
          notes: ''
        },
        amount 
      };
    }
  }

  // 2) If amount is too large or no matches, route to owner
  const owner = owners.find(o => o.method === method);
  if (amount >= ownerThreshold || !owner) {
    // fallback to any owner for that method (or first available)
    const fallback = owner || owners[0];
    if (fallback) return { type: 'OWNER', method, owner: fallback, amount };
  }

  // Default to owner if nothing else
  if (owners.length) return { type: 'OWNER', method, owner: owners[0], amount };
  // If truly no owner handle is present, we still return an OWNER type with dummy handle
  return { type: 'OWNER', method, owner: { method, handle: '<ask owner for handle>', display_name: 'Owner', instructions: '' }, amount };
}
