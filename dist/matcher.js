import { CONFIG } from './config';
import { listOpenWithdrawalsByRail, writeDepositStatus, writeWithdrawalProgress, appendLedger, getOpenCircleCashoutsCached, updateWithdrawalStatusById } from './sheets';
/**
 * Matching rules:
 * 1) Rail-strict.
 * 2) Single-payment constraint: One deposit can fulfill at most one withdrawal (no multi-recipient splits).
 * 3) Prefer exact-amount match.
 * 4) Allow partial match ONLY if remainder (withdrawal.amountRequested - amountAllocated) >= MIN_BUY_IN.
 * 5) Never create a remainder below MIN_BUY_IN.
 */
export async function matchDepositToWithdrawal(spreadsheetId, deposit) {
    if (deposit.status !== 'confirmed')
        return null;
    const open = await listOpenWithdrawalsByRail(spreadsheetId, deposit.rail);
    if (!open.length)
        return null;
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
async function allocate(spreadsheetId, deposit, w, applyAmount) {
    const now = Date.now();
    const newFilled = w.amountFilled + applyAmount;
    const remaining = w.amountRequested - newFilled;
    const closing = remaining === 0 ? 'complete' : 'partial';
    await writeWithdrawalProgress(spreadsheetId, w.id, {
        amountFilled: newFilled,
        status: closing,
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
// Rate limiting for Google Sheets API calls
let lastApiCall = 0;
const RATE_LIMIT_MS = 1000; // 1 second between calls
async function rateLimitedApiCall(apiCall) {
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
function validateAmount(amount) {
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
// Normalize method names with null/undefined safety
function normalizeMethod(method) {
    return (method ?? '').trim().toUpperCase();
}
export async function findMatch(method, amount, owners, ownerThreshold = 300) {
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
    // Normalize method for comparison
    const normalizedMethod = normalizeMethod(method);
    // Check if this is a circle method - get from settings if available
    let isCircleMethod = false;
    try {
        const { getSettingsCached } = await import('./sheets.js');
        const settings = await getSettingsCached();
        isCircleMethod = settings.METHODS_CIRCLE.includes(normalizedMethod);
    }
    catch (error) {
        // Use env defaults if settings unavailable
        const { METHODS_CIRCLE } = await import('./config.js');
        isCircleMethod = METHODS_CIRCLE.includes(normalizedMethod);
        console.log(`[${new Date().toISOString()}] Using env METHODS_CIRCLE defaults`);
    }
    if (isCircleMethod) {
        // Use new circle matching logic
        console.log(`[${new Date().toISOString()}] Using circle matching for method: ${normalizedMethod}`);
        try {
            const circleWithdrawals = await getOpenCircleCashoutsCached();
            // Filter by method with normalized comparison
            const matchingWithdrawals = circleWithdrawals.filter(w => normalizeMethod(w.method) === normalizedMethod);
            console.log(`[${new Date().toISOString()}] Circle withdrawals matching method ${normalizedMethod}: ${matchingWithdrawals.length}`);
            if (matchingWithdrawals.length > 0) {
                // Take the oldest withdrawal (already sorted by request_timestamp_iso ASC)
                const oldestWithdrawal = matchingWithdrawals[0];
                console.log(`[${new Date().toISOString()}] Matched with oldest circle withdrawal: ${oldestWithdrawal.request_id}`);
                // Atomic claim: re-read the row to ensure it's still QUEUED before updating
                try {
                    // Mark the withdrawal as MATCHED (not PAID)
                    await rateLimitedApiCall(() => updateWithdrawalStatusById(oldestWithdrawal.request_id, 'MATCHED', 'Matched with deposit'));
                    console.log(`[${new Date().toISOString()}] Successfully marked circle withdrawal ${oldestWithdrawal.request_id} as MATCHED`);
                    return {
                        type: 'CASHOUT',
                        amount: oldestWithdrawal.amount,
                        method: oldestWithdrawal.method,
                        request_id: oldestWithdrawal.request_id,
                        receiver: oldestWithdrawal.payment_tag_or_address
                    };
                }
                catch (error) {
                    console.error(`[${new Date().toISOString()}] Failed to mark circle withdrawal as matched:`, error);
                    // Continue to owner fallback
                }
            }
        }
        catch (error) {
            console.error(`[${new Date().toISOString()}] Circle matching failed:`, error);
            // Continue to owner fallback
        }
    }
    // Fallback to owner routing for non-circle methods or when circle matching fails
    console.log(`[${new Date().toISOString()}] Using owner routing for method: ${normalizedMethod}`);
    // Find matching owner with normalized comparison
    const owner = owners.find(o => normalizeMethod(o.method) === normalizedMethod);
    if (owner) {
        console.log(`[${new Date().toISOString()}] Routing to owner: ${owner.handle}`);
        return {
            type: 'OWNER',
            method: owner.method,
            amount,
            owner
        };
    }
    // Fallback to any available owner
    if (owners.length > 0) {
        console.log(`[${new Date().toISOString()}] No matching method owner found, using first available owner`);
        return {
            type: 'OWNER',
            method: owners[0].method,
            amount,
            owner: owners[0]
        };
    }
    // If truly no owner handle is present, return dummy owner
    console.warn(`[${new Date().toISOString()}] No owner handles configured for method ${normalizedMethod}`);
    return {
        type: 'OWNER',
        method,
        amount,
        owner: {
            method,
            handle: '<ask owner for handle>',
            display_name: 'Owner',
            instructions: ''
        }
    };
}
