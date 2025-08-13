import { getOpenCashouts, markCashoutMatchedByRow } from './sheets.js';
import { OWNER_FALLBACK_THRESHOLD } from './config.js';
import { MatchResult, OwnerAccount, Method, EnhancedMatchResult } from './types.js';

export async function findMatch(
  method: string,
  amount: number,
  owners: OwnerAccount[],
  ownerThreshold: number = OWNER_FALLBACK_THRESHOLD
): Promise<EnhancedMatchResult> {

  console.log(`Looking for match: ${method} $${amount}`);
  
  // 1) Try to match a cash-out in the sheet (respecting min $20 remainder rule)
  const cashouts = await getOpenCashouts();
  console.log('All cashouts found:', cashouts);

  // Filter cashouts by method
  const matchingCashouts = cashouts.filter(co => co.method === method);
  console.log(`Cashouts matching method ${method}:`, matchingCashouts);
  
  // Find exact match first (preferred)
  const exactMatch = matchingCashouts.find(co => co.amount === amount);
  if (exactMatch) {
    await markCashoutMatchedByRow(exactMatch.rowIndex, 'matched');
    return { 
      type: 'CASHOUT',
      amount: exactMatch.amount,
      method: exactMatch.method,
      rowIndex: exactMatch.rowIndex,
      receiver: exactMatch.receiver_handle || undefined
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
      amount: bestMatch.amount,
      method: bestMatch.method,
      rowIndex: bestMatch.rowIndex,
      receiver: bestMatch.receiver_handle || undefined
    };
  }

  // 2) If amount is too large or no matches, route to owner
  const owner = owners.find(o => o.method === method);
  if (amount >= ownerThreshold || !owner) {
    // fallback to any owner for that method (or first available)
    const fallback = owner || owners[0];
    if (fallback) return { type: 'OWNER', method: fallback.method, amount, owner: fallback };
  }

  // Default to owner if nothing else
  if (owners.length) return { type: 'OWNER', method: owners[0].method, amount, owner: owners[0] };
  // If truly no owner handle is present, we still return an OWNER type with dummy handle
  return { 
    type: 'OWNER', 
    method, 
    amount, 
    owner: { method, handle: '<ask owner for handle>', display_name: 'Owner', instructions: '' }
  };
}
