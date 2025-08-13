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
  
  // 1) Get all open cashouts
  const cashouts = await getOpenCashouts();
  console.log('All cashouts found:', cashouts);

  // Filter cashouts by method
  const matchingCashouts = cashouts.filter(co => co.method === method);
  console.log(`Cashouts matching method ${method}:`, matchingCashouts);
  
  // 2) Check if buy-in amount is larger than any single withdrawal
  // If so, route to owner to avoid multiple payments
  const maxCashoutAmount = matchingCashouts.length > 0 ? Math.max(...matchingCashouts.map(co => co.amount)) : 0;
  if (amount > maxCashoutAmount) {
    console.log(`Buy-in amount $${amount} is larger than max cashout amount $${maxCashoutAmount}, routing to owner`);
    const owner = owners.find(o => o.method === method);
    if (owner) {
      return { type: 'OWNER', method: owner.method, amount, owner };
    }
  }
  
  // 3) Find exact matches first (preferred)
  const exactMatches = matchingCashouts.filter(co => co.amount === amount);
  console.log(`Found ${exactMatches.length} exact matches for $${amount}`);
  
  if (exactMatches.length > 0) {
    // Sort exact matches by priority: FAST first, then oldest timestamp
    exactMatches.sort((a, b) => {
      // First priority: FAST priority cashouts go first
      const aIsFast = a.priority?.toLowerCase() === 'fast';
      const bIsFast = b.priority?.toLowerCase() === 'fast';
      if (aIsFast && !bIsFast) return -1;
      if (!aIsFast && bIsFast) return 1;
      
      // Second priority: oldest timestamp first (longest pending)
      if (a.timestamp && b.timestamp) {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeA - timeB;
      }
      
      return 0;
    });
    
    console.log('Exact matches after priority sorting:', exactMatches.map(m => ({
      rowIndex: m.rowIndex,
      priority: m.priority,
      timestamp: m.timestamp,
      username: m.username
    })));
    
    const exactMatch = exactMatches[0];
    console.log(`Selected exact match: row ${exactMatch.rowIndex} (priority: ${exactMatch.priority}, timestamp: ${exactMatch.timestamp})`);
    await markCashoutMatchedByRow(exactMatch.rowIndex, 'matched');
    return { 
      type: 'CASHOUT',
      amount: exactMatch.amount,
      method: exactMatch.method,
      rowIndex: exactMatch.rowIndex,
      receiver: exactMatch.receiver_handle || undefined
    };
  }
  
  // 4) Find partial matches that respect min $20 remainder rule
  const validPartialMatches = matchingCashouts.filter(co => {
    const remainder = co.amount - amount;
    // Allow if remainder is 0 (exact match) or >= 20
    const isValid = remainder === 0 || remainder >= 20;
    if (!isValid) {
      console.log(`Skipping cashout $${co.amount} - remainder $${remainder} is < $20`);
    }
    return isValid;
  });
  
  console.log(`Found ${validPartialMatches.length} valid partial matches (remainder >= $20)`);
  
  // Sort by priority: 1) FAST priority first, 2) oldest timestamp first, 3) smallest remainder
  validPartialMatches.sort((a, b) => {
    // First priority: FAST priority cashouts go first
    const aIsFast = a.priority?.toLowerCase() === 'fast';
    const bIsFast = b.priority?.toLowerCase() === 'fast';
    if (aIsFast && !bIsFast) return -1;
    if (!aIsFast && bIsFast) return 1;
    
    // Second priority: oldest timestamp first (longest pending)
    if (a.timestamp && b.timestamp) {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      if (timeA !== timeB) return timeA - timeB;
    }
    
    // Third priority: smallest remainder (but still >= 20)
    const remainderA = a.amount - amount;
    const remainderB = b.amount - amount;
    return remainderA - remainderB;
  });
  
  if (validPartialMatches.length > 0) {
    console.log('Partial matches after priority sorting:', validPartialMatches.map(m => ({
      rowIndex: m.rowIndex,
      priority: m.priority,
      timestamp: m.timestamp,
      username: m.username,
      remainder: m.amount - amount
    })));
    
    const bestMatch = validPartialMatches[0];
    console.log(`Selected partial match: row ${bestMatch.rowIndex} (priority: ${bestMatch.priority}, timestamp: ${bestMatch.timestamp}, remainder: $${bestMatch.amount - amount})`);
    await markCashoutMatchedByRow(bestMatch.rowIndex, 'matched');
    return { 
      type: 'CASHOUT',
      amount: bestMatch.amount,
      method: bestMatch.method,
      rowIndex: bestMatch.rowIndex,
      receiver: bestMatch.receiver_handle || undefined
    };
  }

  // 5) If no valid matches found, route to owner
  console.log('No valid cashout matches found, routing to owner');
  const owner = owners.find(o => o.method === method);
  if (owner) {
    return { type: 'OWNER', method: owner.method, amount, owner };
  }
  
  // Fallback to any available owner
  if (owners.length > 0) {
    return { type: 'OWNER', method: owners[0].method, amount, owner: owners[0] };
  }
  
  // If truly no owner handle is present, return dummy owner
  return { 
    type: 'OWNER', 
    method, 
    amount, 
    owner: { method, handle: '<ask owner for handle>', display_name: 'Owner', instructions: '' }
  };
}
