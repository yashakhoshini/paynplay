import { CONFIG, METHODS_CIRCLE } from './config.js';
import {
  listOpenWithdrawalsByRail,
  writeDepositStatus,
  writeWithdrawalProgress,
  appendLedger,
  getOpenCircleCashoutsCached,
  updateWithdrawalStatusById,
} from './sheets.js';

/**
 * Utilities
 */
const toCents = (n: number) => Math.round(Number(n) * 100);

function normalizeMethod(method?: string) {
  // Unify "Apple Pay", "APPLE PAY", "apple_pay" -> "APPLE_PAY"
  return (method ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

// Validate amount with security limits
function validateAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, error: 'Amount must be a positive number' };
  }
  if (amount < CONFIG.MIN_BUY_IN) {
    return { valid: false, error: `Minimum amount is $${CONFIG.MIN_BUY_IN}` };
  }
  if (amount > CONFIG.MAX_BUY_IN) {
    return { valid: false, error: `Maximum amount is $${CONFIG.MAX_BUY_IN}` };
  }
  return { valid: true };
}

// Simple rate limiter to keep Sheets calls within quota
let lastApiCall = 0;
const RATE_LIMIT_MS = 1000; // 1 second
async function rateLimitedApiCall<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const delta = now - lastApiCall;
  if (delta < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - delta));
  }
  lastApiCall = Date.now();
  return fn();
}

/**
 * Matching rules (single-payment; rail-strict):
 * 1) Rail-strict (deposit.rail must match withdrawal rail).
 * 2) One deposit fulfills at most one withdrawal (no multi-splits).
 * 3) Prefer exact amount match (FIFO via list function).
 * 4) Allow partial only when remainder >= MIN_BUY_IN.
 * 5) Never leave remainder below MIN_BUY_IN.
 */
export async function matchDepositToWithdrawalNew(
  spreadsheetId: string,
  deposit: {
    id: string;
    rail: string;
    amount: number;
    status: 'confirmed' | string;
    createdAt?: number;
    confirmedAt?: number;
    userId?: string | number;
  }
) {
  if (deposit.status !== 'confirmed') return null;

  const open = await listOpenWithdrawalsByRail(spreadsheetId, normalizeMethod(deposit.rail));
  if (!open.length) return null;

  const depCents = toCents(deposit.amount);

  // 1) Exact match first (FIFO order assumed by list function)
  const exact = open.find((w) => {
    const remainingCents = toCents(w.amountRequested) - toCents(w.amountFilled);
    return remainingCents === depCents;
  });
  if (exact) {
    await allocate(spreadsheetId, deposit, exact, deposit.amount);
    return exact;
  }

  // 2) Partial only if remainder stays >= MIN_BUY_IN
  for (const w of open) {
    const remainingCents = toCents(w.amountRequested) - toCents(w.amountFilled);
    if (depCents < remainingCents) {
      const remainderAfterCents = remainingCents - depCents;
      if (remainderAfterCents >= toCents(CONFIG.MIN_BUY_IN)) {
        await allocate(spreadsheetId, deposit, w, deposit.amount);
        return w;
      }
    }
  }

  // 3) No match allowed under constraints. Leave deposit unmatched.
  return null;
}

async function allocate(
  spreadsheetId: string,
  deposit: {
    id: string;
    rail: string;
    amount: number;
    confirmedAt?: number;
  },
  w: {
    id: string;
    rail: string;
    amountRequested: number;
    amountFilled: number;
  },
  applyAmount: number
) {
  const now = Date.now();
  const newFilled = Number(w.amountFilled) + Number(applyAmount);
  const remaining = Number(w.amountRequested) - newFilled;
  const closing = remaining <= 0 ? 'complete' : 'partial';

  // 1) Update withdrawal progress (rate-limited)
  await rateLimitedApiCall(() =>
    writeWithdrawalProgress(spreadsheetId, w.id, {
      amountFilled: newFilled,
      status: closing,
      fulfilledBy: 'circle',
      completedAt: closing === 'complete' ? now : undefined,
    })
  );

  // 2) Mark the deposit as processed (keep existing contract: 'confirmed')
  // If your sheets layer supports a terminal status (e.g. 'consumed'),
  // consider switching to that here to make reprocessing impossible.
  await rateLimitedApiCall(() =>
    writeDepositStatus(
      spreadsheetId,
      deposit.id,
      'confirmed',
      deposit.confirmedAt ?? now
    )
  );

  // 3) Ledger entry (idempotency/audit)
  await rateLimitedApiCall(() =>
    appendLedger(spreadsheetId, [
      [
        new Date(now).toISOString(),
        'circle_match',
        deposit.id,
        w.id,
        normalizeMethod(w.rail),
        applyAmount,
      ],
    ])
  );
}

/**
 * findMatch(): front-end routing for a *new* buy-in before logging,
 * choosing between circle cashouts (if available) and owner routing.
 *
 * Returns:
 *  - { type: 'CASHOUT', amount, method, request_id, receiver }
 *  - { type: 'OWNER', amount, method, owner }
 */
export async function findMatch(
  method: string,
  amount: number,
  owners: Array<{ method: string; handle: string; display_name?: string; instructions?: string }>,
  ownerThreshold = 300 // kept for compatibility (not used directly here)
) {
  const when = new Date().toISOString();
  const normalizedMethod = normalizeMethod(method);

  console.log(`[${when}] Looking for match: ${normalizedMethod} $${amount}`);

  // Validate amount early
  const amountValidation = validateAmount(amount);
  if (!amountValidation.valid) {
    console.error(`[${when}] Amount validation failed: ${amountValidation.error}`);
    throw new Error(amountValidation.error);
  }

  if (!method || typeof method !== 'string') {
    console.error(`[${when}] Invalid payment method provided`);
    throw new Error('Invalid payment method');
  }

  if (!Array.isArray(owners)) {
    console.error(`[${when}] Invalid owners array provided`);
    throw new Error('Invalid owners configuration');
  }

  // Is this a circle method? Use config list (stable & cached).
  const isCircleMethod = METHODS_CIRCLE
    .map(normalizeMethod)
    .includes(normalizedMethod);

  if (isCircleMethod) {
    console.log(`[${when}] Using circle matching for method: ${normalizedMethod}`);
    try {
      const circleWithdrawals = await getOpenCircleCashoutsCached();
      const matchingWithdrawals = circleWithdrawals.filter(
        (w) => normalizeMethod(w.method) === normalizedMethod
      );

      console.log(
        `[${when}] Circle withdrawals matching ${normalizedMethod}: ${matchingWithdrawals.length}`
      );

      if (matchingWithdrawals.length > 0) {
        // Oldest first (already sorted ASC by request timestamp)
        const oldest = matchingWithdrawals[0];

        try {
          // Mark as MATCHED (atomic claim) before announcing
          await rateLimitedApiCall(() =>
            updateWithdrawalStatusById(oldest.request_id, 'MATCHED', 'Matched with deposit')
          );
          console.log(
            `[${when}] Marked circle withdrawal ${oldest.request_id} as MATCHED`
          );

          return {
            type: 'CASHOUT' as const,
            amount: oldest.amount,
            method: oldest.method,
            request_id: oldest.request_id,
            receiver: oldest.payment_tag_or_address,
          };
        } catch (e) {
          console.error(
            `[${when}] Failed to mark circle withdrawal MATCHED (continuing to owner fallback):`,
            e
          );
        }
      }
    } catch (e) {
      console.error(`[${when}] Circle matching failed (owner fallback):`, e);
    }
  }

  // Owner routing (fallback or non-circle methods)
  console.log(`[${when}] Using owner routing for method: ${normalizedMethod}`);

  const owner = owners.find(
    (o) => normalizeMethod(o.method) === normalizedMethod
  );

  if (owner) {
    console.log(`[${when}] Routing to owner: ${owner.handle}`);
    return {
      type: 'OWNER' as const,
      method: owner.method,
      amount,
      owner,
    };
  }

  // Fallback to any available owner
  if (owners.length > 0) {
    console.log(`[${when}] No exact owner method match, using first available owner`);
    return {
      type: 'OWNER' as const,
      method: owners[0].method,
      amount,
      owner: owners[0],
    };
  }

  // If no owners at all are configured, return a dummy route
  console.warn(
    `[${when}] No owner handles configured for method ${normalizedMethod}`
  );
  return {
    type: 'OWNER' as const,
    method,
    amount,
    owner: {
      method,
      handle: '<ask owner for handle>',
      display_name: 'Owner',
      instructions: '',
    },
  };
}
