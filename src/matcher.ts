import { getOpenCashouts, markCashoutMatchedByRow } from './sheets.js';
import { OWNER_FALLBACK_THRESHOLD } from './config.js';
import { MatchResult, OwnerAccount, Method } from './types.js';

export async function findMatch(
  method: string,
  amount: number,
  owners: OwnerAccount[],
  ownerThreshold: number = OWNER_FALLBACK_THRESHOLD
): Promise<MatchResult> {

  // 1) Try to match a cash-out in the sheet (respecting min $20 remainder rule)
  const cashouts = await getOpenCashouts();

  // Filter cashouts by method
  const matchingCashouts = cashouts.filter(co => co.method === method);
  
  // Find exact match first (preferred)
  const exactMatch = matchingCashouts.find(co => co.amount === amount);
  if (exactMatch) {
    await markCashoutMatchedByRow(exactMatch.rowIndex, 'matched');
    return { 
      type: 'CASHOUT', 
      cashout: {
        cashout_id: exactMatch.rowIndex.toString(),
        tg_user_id: '',
        display_name: exactMatch.username || '',
        method: exactMatch.method as Method,
        amount: exactMatch.amount,
        priority_type: 'NORMAL',
        status: 'MATCHED',
        requested_at: new Date().toISOString(),
        matched_at: new Date().toISOString(),
        payer_tg_user_id: '',
        payer_handle: '',
        receiver_handle: exactMatch.receiver_handle || '',
        notes: ''
      },
      amount 
    };
  }
  
  // Find partial matches that respect min $20 remainder rule
  const validPartialMatches = matchingCashouts.filter(co => {
    const remainder = co.amount - amount;
    // Allow if remainder is 0 (exact match) or >= 20
    return remainder === 0 || remainder >= 20;
  });
  
  // Sort by remainder (prefer smaller remainders, but still >= 20)
  validPartialMatches.sort((a, b) => {
    const remainderA = a.amount - amount;
    const remainderB = b.amount - amount;
    return remainderA - remainderB;
  });
  
  if (validPartialMatches.length > 0) {
    const bestMatch = validPartialMatches[0];
    await markCashoutMatchedByRow(bestMatch.rowIndex, 'matched');
    return { 
      type: 'CASHOUT', 
      cashout: {
        cashout_id: bestMatch.rowIndex.toString(),
        tg_user_id: '',
        display_name: bestMatch.username || '',
        method: bestMatch.method as Method,
        amount: bestMatch.amount,
        priority_type: 'NORMAL',
        status: 'MATCHED',
        requested_at: new Date().toISOString(),
        matched_at: new Date().toISOString(),
        payer_tg_user_id: '',
        payer_handle: '',
        receiver_handle: bestMatch.receiver_handle || '',
        notes: ''
      },
      amount 
    };
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
