import { CONFIG } from './config.js';
import { listOpenWithdrawalsByRail, writeDepositStatus, writeWithdrawalProgress, appendLedger, getOpenCircleCashoutsCached, updateWithdrawalStatusById, } from './sheets.js';
/**
 * Matching rules:
 * 1) Rail-strict.
 * 2) Single-payment constraint: One deposit can fulfill at most one withdrawal (no multi-recipient splits).
 * 3) Prefer exact-amount match.
 * 4) Allow partial match ONLY if remainder (withdrawal.amountRequested - amountAllocated) >= MIN_BUY_IN.
 * 5) Never create a remainder below MIN_BUY_IN.
 */
export async function matchDepositToWithdrawalNew(spreadsheetId, deposit) {
    if (deposit.status !== 'confirmed')
        return null;
    const open = await listOpenWithdrawalsByRail(spreadsheetId, deposit.rail);
    if (!open.length)
        return null;
    // 1) Exact match first (FIFO ensured by list function)
    const exact = open.find((w) => w.amountRequested - w.amountFilled === deposit.amount);
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
        status: closing, // cast to match your sheet’s expected enum/string
        fulfilledBy: 'circle',
        completedAt: closing === 'complete' ? now : undefined,
    });
    // Mark deposit as "consumed" — if your schema supports a distinct status (e.g., "applied"),
    // prefer that instead of re-setting "confirmed".
    await writeDepositStatus(spreadsheetId, deposit.id, 'confirmed', deposit.confirmedAt ?? now);
    await appendLedger(spreadsheetId, [
        [
            new Date(now).toISOString(),
            'circle_match',
            deposit.id,
            w.id,
            w.rail,
            applyAmount,
        ],
    ]);
}
// ----------------------------------------------------------------------------
// Rate limiting for Google Sheets API calls
// ----------------------------------------------------------------------------
let lastApiCall = 0;
const RATE_LIMIT_MS = 1000; // 1 second between calls
async function rateLimitedApiCall(apiCall) {
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCall;
    if (timeSinceLastCall < RATE_LIMIT_MS) {
        const delay = RATE_LIMIT_MS - timeSinceLastCall;
        await new Promise((resolve) => setTimeout(resolve, delay));
    }
    lastApiCall = Date.now();
    return apiCall();
}
// ----------------------------------------------------------------------------
// Validation / helpers
// ----------------------------------------------------------------------------
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
function normalizeMethod(method) {
    return (method ?? '').trim().toUpperCase();
}
// ----------------------------------------------------------------------------
// Matching entry point for live buy-ins (circle-first, then owner fallback)
// ----------------------------------------------------------------------------
export async function findMatch(method, amount, owners, _ownerThreshold = 300 // kept for signature compatibility
) {
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
    const normalizedMethod = normalizeMethod(method);
    // Determine if this is a "circle" method
    let isCircleMethod = false;
    try {
        // Optional helper; if missing or mis-shaped we’ll fall back.
        const mod = await import('./sheets.js');
        const getSettingsCached = mod?.getSettingsCached;
        if (typeof getSettingsCached === 'function') {
            const settings = await getSettingsCached();
            const arr = Array.isArray(settings?.METHODS_CIRCLE)
                ? settings.METHODS_CIRCLE
                : [];
            isCircleMethod = arr.map(normalizeMethod).includes(normalizedMethod);
        }
        else {
            throw new Error('getSettingsCached not available');
        }
    }
    catch {
        // Fallback to env defaults
        const cfg = await import('./config.js');
        const arr = Array.isArray(cfg?.METHODS_CIRCLE) ? cfg.METHODS_CIRCLE : [];
        isCircleMethod = arr.map(normalizeMethod).includes(normalizedMethod);
        console.log(`[${new Date().toISOString()}] Using env METHODS_CIRCLE defaults`);
    }
    if (isCircleMethod) {
        console.log(`[${new Date().toISOString()}] Using circle matching for method: ${normalizedMethod}`);
        try {
            const circleWithdrawals = await getOpenCircleCashoutsCached();
            const matchingWithdrawals = circleWithdrawals.filter((w) => normalizeMethod(w.method) === normalizedMethod);
            console.log(`[${new Date().toISOString()}] Circle withdrawals matching method ${normalizedMethod}: ${matchingWithdrawals.length}`);
            if (matchingWithdrawals.length > 0) {
                // Oldest first (assumes pre-sorted asc by request_timestamp_iso)
                const oldestWithdrawal = matchingWithdrawals[0];
                // NOTE: handle both {amount_usd} and {amount}
                const amountUsd = Number(oldestWithdrawal.amount_usd) || Number(oldestWithdrawal.amount) || 0;
                try {
                    // Best-effort atomic claim — ideally your sheet function enforces state transitions
                    await rateLimitedApiCall(() => updateWithdrawalStatusById(oldestWithdrawal.request_id, 'MATCHED', 'Matched with deposit'));
                    console.log(`[${new Date().toISOString()}] Successfully marked circle withdrawal ${oldestWithdrawal.request_id} as MATCHED`);
                    return {
                        type: 'CASHOUT',
                        amount: amountUsd,
                        method: oldestWithdrawal.method,
                        request_id: oldestWithdrawal.request_id,
                        receiver: oldestWithdrawal.payment_tag_or_address,
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
    // Owner fallback
    console.log(`[${new Date().toISOString()}] Using owner routing for method: ${normalizedMethod}`);
    const owner = owners.find((o) => normalizeMethod(o.method) === normalizedMethod);
    if (owner) {
        console.log(`[${new Date().toISOString()}] Routing to owner: ${owner.handle}`);
        return {
            type: 'OWNER',
            method: owner.method,
            amount,
            owner,
        };
    }
    if (owners.length > 0) {
        console.log(`[${new Date().toISOString()}] No matching method owner found, using first available owner`);
        return {
            type: 'OWNER',
            method: owners[0].method,
            amount,
            owner: owners[0],
        };
    }
    // No owners configured — return a safe dummy
    console.warn(`[${new Date().toISOString()}] No owner handles configured for method ${normalizedMethod}`);
    return {
        type: 'OWNER',
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
