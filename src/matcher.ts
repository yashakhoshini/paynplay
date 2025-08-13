import { getOpenCashouts, markCashoutMatchedByRow } from './sheets.js';
import { OWNER_FALLBACK_THRESHOLD, MAX_BUYIN_AMOUNT, MIN_BUYIN_AMOUNT } from './config.js';
import { MatchResult, OwnerAccount, Method, EnhancedMatchResult } from './types.js';

// Rate limiting for Google Sheets API calls
let lastApiCall = 0;
const RATE_LIMIT_MS = 1000; // 1 second between calls

async function rateLimitedApiCall<T>(apiCall: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;
  
  if (timeSinceLastCall < RATE_LIMIT_MS) {
    const delay = RATE_LIMIT_MS - timeSinceLastCall;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  lastApiCall = Date.now();
  return apiCall();
}

// Validate amount with security limits
function validateAmount(amount: number): { valid: boolean; error?: string } {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, error: 'Amount must be a positive number' };
  }
  
  if (amount < MIN_BUYIN_AMOUNT) {
    return { valid: false, error: `Minimum amount is $${MIN_BUYIN_AMOUNT}` };
  }
  
  if (amount > MAX_BUYIN_AMOUNT) {
    return { valid: false, error: `Maximum amount is $${MAX_BUYIN_AMOUNT}` };
  }
  
  return { valid: true };
}

export async function findMatch(
  method: string,
  amount: number,
  owners: OwnerAccount[],
  ownerThreshold: number = OWNER_FALLBACK_THRESHOLD
): Promise<EnhancedMatchResult> {

  console.log(`[${new Date().toISOString()}] Looking for match: ${method} $${amount}`);
  
  // Validate amount first
  const amountValidation = validateAmount(amount);
  if (!amountValidation.valid) {
    console.error(`[${new Date().toISOString()}] Amount validation failed: ${amountValidation.error}`);
    throw new Error(amountValidation.error);
  }
  
  // Validate method
  if (!method || typeof method !== 'string') {
    console.error(`[${new Date().toISOString()}] Invalid payment method provided`);
    throw new Error('Invalid payment method');
  }
  
  // Validate owners array
  if (!Array.isArray(owners)) {
    console.error(`[${new Date().toISOString()}] Invalid owners array provided`);
    throw new Error('Invalid owners configuration');
  }
  
  // 1) Get all open cashouts with error handling
  let cashouts;
  try {
    cashouts = await rateLimitedApiCall(() => getOpenCashouts());
    console.log(`[${new Date().toISOString()}] Retrieved ${cashouts.length} cashouts`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to get cashouts:`, error);
    // Fallback to owner routing if sheets are unavailable
    const owner = owners.find(o => o.method === method);
    if (owner) {
      console.log(`[${new Date().toISOString()}] Falling back to owner: ${owner.handle}`);
      return { type: 'OWNER', method: owner.method, amount, owner };
    }
    throw new Error('Unable to access payment data. Please try again later.');
  }

  // Filter cashouts by method
  const matchingCashouts = cashouts.filter(co => co.method === method);
  console.log(`[${new Date().toISOString()}] Cashouts matching method ${method}: ${matchingCashouts.length}`);
  
  // 2) Check if buy-in amount is larger than any single withdrawal
  // If so, route to owner to avoid multiple payments
  const maxCashoutAmount = matchingCashouts.length > 0 ? Math.max(...matchingCashouts.map(co => co.amount)) : 0;
  if (amount > maxCashoutAmount) {
    console.log(`[${new Date().toISOString()}] Buy-in amount $${amount} is larger than max cashout amount $${maxCashoutAmount}, routing to owner`);
    const owner = owners.find(o => o.method === method);
    if (owner) {
      return { type: 'OWNER', method: owner.method, amount, owner };
    }
  }
  
  // 3) Find exact matches first (preferred)
  const exactMatches = matchingCashouts.filter(co => co.amount === amount);
  console.log(`[${new Date().toISOString()}] Found ${exactMatches.length} exact matches for $${amount}`);
  
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
    console.log(`[${new Date().toISOString()}] Selected exact match: row ${exactMatch.rowIndex} (priority: ${exactMatch.priority}, timestamp: ${exactMatch.timestamp})`);
    
    // Race condition protection: try to mark as matched atomically
    try {
      await rateLimitedApiCall(() => markCashoutMatchedByRow(exactMatch.rowIndex, 'matched'));
      console.log(`[${new Date().toISOString()}] Successfully marked cashout ${exactMatch.rowIndex} as matched`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Failed to mark cashout as matched:`, error);
      // If marking fails, try the next match or fall back to owner
      if (exactMatches.length > 1) {
        console.log(`[${new Date().toISOString()}] Trying next exact match`);
        const nextMatch = exactMatches[1];
        try {
          await rateLimitedApiCall(() => markCashoutMatchedByRow(nextMatch.rowIndex, 'matched'));
          return { 
            type: 'CASHOUT',
            amount: nextMatch.amount,
            method: nextMatch.method,
            rowIndex: nextMatch.rowIndex,
            receiver: nextMatch.receiver_handle || undefined
          };
        } catch (retryError) {
          console.error(`[${new Date().toISOString()}] Failed to mark second match as matched:`, retryError);
        }
      }
      // Fall back to owner if all marking attempts fail
      const owner = owners.find(o => o.method === method);
      if (owner) {
        return { type: 'OWNER', method: owner.method, amount, owner };
      }
    }
    
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
      console.log(`[${new Date().toISOString()}] Skipping cashout $${co.amount} - remainder $${remainder} is < $20`);
    }
    return isValid;
  });
  
  console.log(`[${new Date().toISOString()}] Found ${validPartialMatches.length} valid partial matches (remainder >= $20)`);
  
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
    console.log(`[${new Date().toISOString()}] Selected partial match: row ${bestMatch.rowIndex} (priority: ${bestMatch.priority}, timestamp: ${bestMatch.timestamp}, remainder: $${bestMatch.amount - amount})`);
    
    // Race condition protection for partial matches
    try {
      await rateLimitedApiCall(() => markCashoutMatchedByRow(bestMatch.rowIndex, 'matched'));
      console.log(`[${new Date().toISOString()}] Successfully marked partial cashout ${bestMatch.rowIndex} as matched`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Failed to mark partial cashout as matched:`, error);
      // Try next partial match or fall back to owner
      if (validPartialMatches.length > 1) {
        const nextMatch = validPartialMatches[1];
        try {
          await rateLimitedApiCall(() => markCashoutMatchedByRow(nextMatch.rowIndex, 'matched'));
          return { 
            type: 'CASHOUT',
            amount: nextMatch.amount,
            method: nextMatch.method,
            rowIndex: nextMatch.rowIndex,
            receiver: nextMatch.receiver_handle || undefined
          };
        } catch (retryError) {
          console.error(`[${new Date().toISOString()}] Failed to mark second partial match:`, retryError);
        }
      }
      // Fall back to owner
      const owner = owners.find(o => o.method === method);
      if (owner) {
        return { type: 'OWNER', method: owner.method, amount, owner };
      }
    }
    
    return { 
      type: 'CASHOUT',
      amount: bestMatch.amount,
      method: bestMatch.method,
      rowIndex: bestMatch.rowIndex,
      receiver: bestMatch.receiver_handle || undefined
    };
  }

  // 5) If no valid matches found, route to owner
  console.log(`[${new Date().toISOString()}] No valid cashout matches found, routing to owner`);
  const owner = owners.find(o => o.method === method);
  if (owner) {
    return { type: 'OWNER', method: owner.method, amount, owner };
  }
  
  // Fallback to any available owner
  if (owners.length > 0) {
    console.log(`[${new Date().toISOString()}] No matching method owner found, using first available owner`);
    return { type: 'OWNER', method: owners[0].method, amount, owner: owners[0] };
  }
  
  // If truly no owner handle is present, return dummy owner
  console.warn(`[${new Date().toISOString()}] No owner handles configured for method ${method}`);
  return { 
    type: 'OWNER', 
    method, 
    amount, 
    owner: { method, handle: '<ask owner for handle>', display_name: 'Owner', instructions: '' }
  };
}
