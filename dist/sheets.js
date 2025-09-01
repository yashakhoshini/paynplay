import { google } from 'googleapis';
import { getClient } from './googleClient.js';
import { SHEET_ID, METHODS_ENABLED_DEFAULT, DEFAULT_CURRENCY, DEFAULT_FAST_FEE, OWNER_FALLBACK_THRESHOLD, OWNER_TG_USERNAME, ZELLE_HANDLE, VENMO_HANDLE, CASHAPP_HANDLE, PAYPAL_HANDLE, SHEETS_RATE_LIMIT_MS, CLIENT_NAME, METHODS_CIRCLE, METHODS_EXTERNAL_LINK, STRIPE_CHECKOUT_URL, WITHDRAW_STALE_HOURS, APPLE_PAY_HANDLE, PAYPAL_EMAIL, CRYPTO_WALLET_BTC, CRYPTO_WALLET_ETH, CRYPTO_WALLET, CRYPTO_NETWORKS } from './config.js';
export async function appendWithdrawalRequest(row) {
    const svc = await getSheetsClient();
    // Ensure 12-column header exists (A-L). We also support optional M,N for matching window/owner fulfill.
    await ensureSheetHeaders('Withdrawals');
    const values = [[
            row.request_id, // A
            String(row.user_id), // B
            row.username, // C
            String(row.amount_usd), // D
            row.method, // E
            row.payment_tag_or_address, // F
            row.request_timestamp_iso, // G
            '', // H approved_by_user_id
            '', // I approved_at_iso
            row.status, // J status
            row.payout_type, // K payout_type
            row.notes || '' // L notes
        ]];
    await retryApiCall(() => svc.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Withdrawals!A:L',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values }
    }));
}
export async function setWithdrawalStatus(requestId, status, extra) {
    const svc = await getSheetsClient();
    const res = await retryApiCall(() => svc.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Withdrawals!A:O' // allow up to O for extra fields
    }));
    const rows = res.data.values || [];
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === requestId) {
            rowIndex = i + 1;
            break;
        }
    }
    if (rowIndex === -1)
        throw new Error(`Withdrawal ${requestId} not found`);
    const updates = [
        { range: `Withdrawals!J${rowIndex}`, values: [[status]] }
    ];
    if (extra?.approvedByUserId) {
        updates.push({ range: `Withdrawals!H${rowIndex}`, values: [[extra.approvedByUserId]] });
        updates.push({ range: `Withdrawals!I${rowIndex}`, values: [[new Date().toISOString()]] });
    }
    if (extra?.matchedDueAtISO) {
        // Use column M for due_at_iso (optional extra column)
        updates.push({ range: `Withdrawals!M${rowIndex}`, values: [[extra.matchedDueAtISO]] });
    }
    if (extra?.ownerManualPaidBy) {
        // Use columns N,O for owner manual fulfillment
        updates.push({ range: `Withdrawals!N${rowIndex}`, values: [[extra.ownerManualPaidBy]] });
        updates.push({ range: `Withdrawals!O${rowIndex}`, values: [[extra.ownerManualPaidAtISO || new Date().toISOString()]] });
    }
    if (extra?.notesAppend) {
        const oldNotes = (rows[rowIndex - 1][11] || '');
        const newNotes = oldNotes ? `${oldNotes} | ${extra.notesAppend}` : extra.notesAppend;
        updates.push({ range: `Withdrawals!L${rowIndex}`, values: [[newNotes]] });
    }
    await retryApiCall(() => svc.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: updates }
    }));
}
export async function requeueExpiredMatched(nowISO) {
    const svc = await getSheetsClient();
    const res = await retryApiCall(() => svc.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Withdrawals!A:O'
    }));
    const rows = res.data.values || [];
    const now = nowISO ? Date.parse(nowISO) : Date.now();
    const updates = [];
    let count = 0;
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const status = r[9];
        const dueAt = r[12]; // column M (0-based index 12)
        if (status === 'MATCHED' && dueAt && Date.parse(dueAt) < now) {
            const rowIndex = i + 1;
            count++;
            updates.push({ range: `Withdrawals!J${rowIndex}`, values: [['QUEUED']] });
            updates.push({ range: `Withdrawals!M${rowIndex}`, values: [['']] });
            const oldNotes = r[11] || '';
            const newNotes = oldNotes ? `${oldNotes} | auto-requeue` : 'auto-requeue';
            updates.push({ range: `Withdrawals!L${rowIndex}`, values: [[newNotes]] });
        }
    }
    if (updates.length) {
        await retryApiCall(() => svc.spreadsheets.values.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: { valueInputOption: 'USER_ENTERED', data: updates }
        }));
    }
    return count;
}
// --- DEPOSITS --------------------------------------------------------------
export async function appendDeposit(row) {
    const svc = await getSheetsClient();
    await ensureSheetHeaders('Deposits');
    const values = [[
            row.deposit_id,
            String(row.user_id),
            row.username,
            String(row.amount_usd),
            row.method,
            row.pay_to_handle,
            row.created_at_iso,
            row.status,
            row.notes || ''
        ]];
    await retryApiCall(() => svc.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Deposits!A:I',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values }
    }));
}
// Singleton Google Sheets client
let sheetsClient = null;
let lastApiCall = 0;
// Cache for Settings (60s TTL)
let settingsCache = null;
const SETTINGS_CACHE_TTL = 60000; // 60 seconds
// Cache for open circle cashouts (5s TTL)
let openCashoutsCache = null;
const CASHOUTS_CACHE_TTL = 5000; // 5 seconds
// Rate limiting for Google Sheets API calls
async function rateLimitedApiCall(apiCall) {
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCall;
    if (timeSinceLastCall < SHEETS_RATE_LIMIT_MS) {
        const delay = SHEETS_RATE_LIMIT_MS - timeSinceLastCall;
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Rate limiting: waiting ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    lastApiCall = Date.now();
    return apiCall();
}
// Retry logic for failed API calls
async function retryApiCall(apiCall, maxRetries = 3, baseDelay = 1000) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await rateLimitedApiCall(apiCall);
        }
        catch (error) {
            lastError = error;
            console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] API call failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error);
            if (attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
                console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}
// Singleton client creation
async function getSheetsClient() {
    if (sheetsClient) {
        return sheetsClient;
    }
    try {
        const authClient = await getClient();
        sheetsClient = google.sheets({ version: 'v4', auth: authClient });
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Google Sheets client initialized`);
        return sheetsClient;
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to create Google Sheets client:`, error);
        throw new Error('Unable to authenticate with Google Sheets. Please check your service account credentials.');
    }
}
// Cache invalidation functions
export function invalidateSettingsCache() {
    settingsCache = null;
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Settings cache invalidated`);
}
export function invalidateCashoutsCache() {
    openCashoutsCache = null;
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Cashouts cache invalidated`);
}
// Validate sheet permissions on startup
export async function validateSheetAccess() {
    try {
        const svc = await getSheetsClient();
        // Try to read the sheet metadata
        const meta = await retryApiCall(() => svc.spreadsheets.get({ spreadsheetId: SHEET_ID }));
        if (!meta.data.sheets || meta.data.sheets.length === 0) {
            console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] No sheets found in spreadsheet`);
            return false;
        }
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Successfully validated sheet access. Found ${meta.data.sheets.length} sheets.`);
        return true;
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Sheet access validation failed:`, error);
        return false;
    }
}
// Cached settings getter
export async function getSettingsCached() {
    const now = Date.now();
    // Return cached data if still valid
    if (settingsCache && (now - settingsCache.timestamp) < SETTINGS_CACHE_TTL) {
        return settingsCache.data;
    }
    try {
        const svc = await getSheetsClient();
        // Try read Settings!A1:B
        try {
            const res = await retryApiCall(() => svc.spreadsheets.values.get({
                spreadsheetId: SHEET_ID,
                range: 'Settings!A1:B999',
                valueRenderOption: 'UNFORMATTED_VALUE'
            }));
            const rows = res.data.values || [];
            const headers = (rows[0] || []).map(String);
            if (headers[0]?.toLowerCase() === 'key' && headers[1]?.toLowerCase() === 'value') {
                const map = new Map();
                for (let i = 1; i < rows.length; i++) {
                    const [k, v] = rows[i] || [];
                    if (!k)
                        continue;
                    map.set(String(k).trim().toUpperCase(), String(v ?? '').trim());
                }
                const methods = (map.get('METHODS_ENABLED') || METHODS_ENABLED_DEFAULT.join(','))
                    .split(',')
                    .map((s) => s.trim().toUpperCase())
                    .filter(Boolean)
                    .filter((method) => method !== 'CASH'); // Explicitly exclude CASH
                const settings = {
                    CLUB_NAME: map.get('CLUB_NAME') || 'Club',
                    METHODS_ENABLED: methods,
                    CURRENCY: map.get('CURRENCY') || DEFAULT_CURRENCY,
                    FAST_FEE_PCT: Number(map.get('FAST_FEE_PCT') || DEFAULT_FAST_FEE),
                    OWNER_FALLBACK_THRESHOLD: Number(map.get('OWNER_FALLBACK_THRESHOLD') || OWNER_FALLBACK_THRESHOLD),
                    OWNER_TG_USERNAME: map.get('OWNER_TG_USERNAME') || OWNER_TG_USERNAME,
                    // Real-club ops settings (sheet overrides env)
                    STRIPE_CHECKOUT_URL: map.get('STRIPE_CHECKOUT_URL') || STRIPE_CHECKOUT_URL,
                    METHODS_CIRCLE: map.get('METHODS_CIRCLE') ?
                        map.get('METHODS_CIRCLE').split(',').map(s => s.trim().toUpperCase()).filter(Boolean) :
                        METHODS_CIRCLE,
                    METHODS_EXTERNAL_LINK: map.get('METHODS_EXTERNAL_LINK') ?
                        map.get('METHODS_EXTERNAL_LINK').split(',').map(s => s.trim().toUpperCase()).filter(Boolean) :
                        METHODS_EXTERNAL_LINK,
                    WITHDRAW_STALE_HOURS: Number(map.get('WITHDRAW_STALE_HOURS') || WITHDRAW_STALE_HOURS),
                    // Owner payment method addresses
                    APPLE_PAY_HANDLE: map.get('APPLE_PAY_HANDLE') || APPLE_PAY_HANDLE,
                    CASHAPP_HANDLE: map.get('CASHAPP_HANDLE') || CASHAPP_HANDLE,
                    PAYPAL_EMAIL: map.get('PAYPAL_EMAIL') || PAYPAL_EMAIL,
                    CRYPTO_WALLET_BTC: map.get('CRYPTO_WALLET_BTC') || CRYPTO_WALLET_BTC,
                    CRYPTO_WALLET_ETH: map.get('CRYPTO_WALLET_ETH') || CRYPTO_WALLET_ETH,
                    CRYPTO_WALLET: map.get('CRYPTO_WALLET') || CRYPTO_WALLET,
                    CRYPTO_NETWORKS: (map.get('CRYPTO_NETWORKS') || CRYPTO_NETWORKS).split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
                };
                // Cache the result
                settingsCache = { data: settings, timestamp: now };
                console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Loaded settings from sheet`);
                return settings;
            }
        }
        catch (error) {
            console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] No Settings tab found, using env defaults:`, error);
            // ignore (no Settings tab)
        }
        // Fallback: use env defaults
        const settings = {
            CLUB_NAME: 'Club',
            METHODS_ENABLED: METHODS_ENABLED_DEFAULT,
            CURRENCY: DEFAULT_CURRENCY,
            FAST_FEE_PCT: DEFAULT_FAST_FEE,
            OWNER_FALLBACK_THRESHOLD: OWNER_FALLBACK_THRESHOLD,
            OWNER_TG_USERNAME: OWNER_TG_USERNAME,
            STRIPE_CHECKOUT_URL: STRIPE_CHECKOUT_URL,
            METHODS_CIRCLE: METHODS_CIRCLE,
            METHODS_EXTERNAL_LINK: METHODS_EXTERNAL_LINK,
            WITHDRAW_STALE_HOURS: WITHDRAW_STALE_HOURS,
            // Owner payment method addresses
            APPLE_PAY_HANDLE: APPLE_PAY_HANDLE,
            CASHAPP_HANDLE: CASHAPP_HANDLE,
            PAYPAL_EMAIL: PAYPAL_EMAIL,
            CRYPTO_WALLET_BTC: CRYPTO_WALLET_BTC,
            CRYPTO_WALLET_ETH: CRYPTO_WALLET_ETH,
            CRYPTO_WALLET: CRYPTO_WALLET,
            CRYPTO_NETWORKS: CRYPTO_NETWORKS.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
        };
        // Cache the result even for fallback
        settingsCache = { data: settings, timestamp: now };
        return settings;
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to get settings:`, error);
        throw error;
    }
}
// Legacy function for backward compatibility
export async function getSettings() {
    return getSettingsCached();
}
export async function getOwnerAccounts() {
    try {
        const svc = await getSheetsClient();
        // Try OwnerAccounts sheet if present
        try {
            const res = await retryApiCall(() => svc.spreadsheets.values.get({
                spreadsheetId: SHEET_ID,
                range: 'OwnerAccounts!A1:D999',
                valueRenderOption: 'UNFORMATTED_VALUE'
            }));
            const rows = res.data.values || [];
            const headers = (rows[0] || []).map(String);
            if (headers[0]?.toLowerCase() === 'method' && headers[1]?.toLowerCase() === 'handle') {
                const accounts = [];
                for (let i = 1; i < rows.length; i++) {
                    const [method, handle, displayName, instructions] = rows[i] || [];
                    if (!method || !handle)
                        continue;
                    accounts.push({
                        method: String(method).trim().toUpperCase(),
                        handle: String(handle).trim(),
                        display_name: String(displayName || method).trim(),
                        instructions: String(instructions || '').trim()
                    });
                }
                console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Loaded ${accounts.length} owner accounts from sheet`);
                return accounts;
            }
        }
        catch (error) {
            console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] No OwnerAccounts tab found, using env fallbacks:`, error);
            // ignore (no OwnerAccounts tab)
        }
        // Fallback: use env handles
        const accounts = [];
        if (ZELLE_HANDLE)
            accounts.push({ method: 'ZELLE', handle: ZELLE_HANDLE, display_name: 'Zelle', instructions: 'Send to Zelle handle' });
        if (VENMO_HANDLE)
            accounts.push({ method: 'VENMO', handle: VENMO_HANDLE, display_name: 'Venmo', instructions: 'Send to Venmo handle' });
        if (CASHAPP_HANDLE)
            accounts.push({ method: 'CASHAPP', handle: CASHAPP_HANDLE, display_name: 'CashApp', instructions: 'Send to CashApp handle' });
        if (PAYPAL_HANDLE)
            accounts.push({ method: 'PAYPAL', handle: PAYPAL_HANDLE, display_name: 'PayPal', instructions: 'Send to PayPal handle' });
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Using ${accounts.length} env owner accounts`);
        return accounts;
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to get owner accounts:`, error);
        return [];
    }
}
// New function to get open circle cashouts (cached)
export async function getOpenCircleCashoutsCached() {
    const now = Date.now();
    // Return cached data if still valid
    if (openCashoutsCache && (now - openCashoutsCache.timestamp) < CASHOUTS_CACHE_TTL) {
        return openCashoutsCache.data;
    }
    try {
        const svc = await getSheetsClient();
        const res = await retryApiCall(() => svc.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'Withdrawals!A2:L'
        }));
        const rows = res.data.values || [];
        const circleWithdrawals = [];
        for (const row of rows) {
            const status = row[9]; // status column
            const payoutType = row[10]; // payout_type column
            // Only consider QUEUED withdrawals with CIRCLE payout type
            if (status === 'QUEUED' && payoutType === 'CIRCLE') {
                circleWithdrawals.push({
                    request_id: row[0],
                    user_id: row[1],
                    username: row[2],
                    method: row[4],
                    amount: Number(row[3]),
                    payment_tag_or_address: row[5],
                    request_timestamp_iso: row[6],
                    status: row[9],
                    payout_type: row[10]
                });
            }
        }
        // Sort by request_timestamp_iso ASC (oldest first)
        circleWithdrawals.sort((a, b) => {
            const timeA = new Date(a.request_timestamp_iso).getTime();
            const timeB = new Date(b.request_timestamp_iso).getTime();
            return timeA - timeB;
        });
        // Cache the result
        openCashoutsCache = { data: circleWithdrawals, timestamp: now };
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Retrieved ${circleWithdrawals.length} circle withdrawals (cached)`);
        return circleWithdrawals;
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to get circle withdrawals:`, error);
        return [];
    }
}
// Legacy function for backward compatibility
export async function getOpenCashouts() {
    return getOpenCircleCashoutsCached();
}
// New withdrawal functions
export async function appendWithdrawalCircle(row) {
    try {
        const svc = await getSheetsClient();
        // Ensure Withdrawals sheet exists with headers
        await ensureSheetHeaders('Withdrawals');
        const withdrawalRow = [
            row.request_id,
            String(row.user_id),
            row.username,
            String(row.amount_usd),
            row.method,
            row.payment_tag_or_address,
            row.request_timestamp_iso,
            '', // approved_by_user_id (empty initially)
            '', // approved_at_iso (empty initially)
            'QUEUED', // status
            'CIRCLE', // payout_type
            row.notes || ''
        ];
        await retryApiCall(() => svc.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'Withdrawals!A:L',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [withdrawalRow] }
        }));
        // Invalidate cache immediately
        invalidateCashoutsCache();
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Added circle withdrawal: ${row.request_id}`);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to append circle withdrawal:`, error);
        throw error;
    }
}
export async function appendWithdrawalOwner(row) {
    try {
        const svc = await getSheetsClient();
        // Ensure Withdrawals sheet exists with headers
        await ensureSheetHeaders('Withdrawals');
        const withdrawalRow = [
            row.request_id,
            String(row.user_id),
            row.username,
            String(row.amount_usd),
            row.method,
            row.payment_tag_or_address,
            row.request_timestamp_iso,
            '', // approved_by_user_id (empty initially)
            '', // approved_at_iso (empty initially)
            'LOGGED', // status (not QUEUED for owner withdrawals)
            'OWNER', // payout_type
            row.notes || ''
        ];
        // Add to Withdrawals sheet
        await retryApiCall(() => svc.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'Withdrawals!A:L',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [withdrawalRow] }
        }));
        // Also add to Owner Payouts sheet for tracking
        await ensureSheetHeaders('OwnerPayouts');
        const ownerPayoutRow = [
            row.request_id, // payout_id
            String(row.user_id), // user_id
            row.username, // username
            String(row.amount_usd), // amount_usd
            row.method, // channel
            row.payment_tag_or_address, // owner_wallet_or_handle
            row.request_timestamp_iso, // request_timestamp_iso
            '', // paid_at_iso initially empty
            'PENDING', // status
            row.notes || '' // notes
        ];
        await retryApiCall(() => svc.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'OwnerPayouts!A:J',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [ownerPayoutRow] }
        }));
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Added owner withdrawal: ${row.request_id}`);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to append owner withdrawal:`, error);
        throw error;
    }
}
export async function updateWithdrawalStatusById(requestId, newStatus, approvedByUserId) {
    try {
        const svc = await getSheetsClient();
        // Find the row with the request_id
        const res = await retryApiCall(() => svc.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'Withdrawals!A:L'
        }));
        const rows = res.data.values || [];
        let rowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === requestId) {
                rowIndex = i + 1; // Sheets is 1-indexed
                break;
            }
        }
        if (rowIndex === -1) {
            throw new Error(`Withdrawal with request_id ${requestId} not found`);
        }
        // Update status and approval info
        // Correct column order: H = approved_by_user_id, I = approved_at_iso, J = status
        const updates = [
            { range: `Withdrawals!H${rowIndex}`, values: [[approvedByUserId || '']] },
            { range: `Withdrawals!I${rowIndex}`, values: [[new Date().toISOString()]] },
            { range: `Withdrawals!J${rowIndex}`, values: [[newStatus]] }
        ];
        await retryApiCall(() => svc.spreadsheets.values.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: updates
            }
        }));
        // Invalidate cache
        invalidateCashoutsCache();
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Updated withdrawal ${requestId} to status: ${newStatus}`);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to update withdrawal status:`, error);
        throw error;
    }
}
// Legacy function for backward compatibility
export async function updateWithdrawalStatus(requestId, status, notes) {
    return updateWithdrawalStatusById(requestId, status, notes);
}
// Owner payouts functions
export async function appendOwnerPayout(row) {
    try {
        const svc = await getSheetsClient();
        // Ensure Owner Payouts sheet exists with headers
        await ensureSheetHeaders('OwnerPayouts');
        const payoutRow = [
            row.payout_id,
            String(row.user_id),
            row.username,
            String(row.amount_usd),
            row.channel,
            row.owner_wallet_or_handle,
            row.request_timestamp_iso,
            '', // paid_at_iso (empty initially)
            row.status,
            row.notes || ''
        ];
        await retryApiCall(() => svc.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'OwnerPayouts!A:J',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [payoutRow] }
        }));
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Appended owner payout: ${row.payout_id}`);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to append owner payout:`, error);
        throw new Error('Unable to create owner payout record. Please try again.');
    }
}
// Helper function to ensure sheet headers exist
async function ensureSheetHeaders(sheetName) {
    try {
        const svc = await getSheetsClient();
        // Check if sheet exists
        const meta = await retryApiCall(() => svc.spreadsheets.get({ spreadsheetId: SHEET_ID }));
        const sheetExists = meta.data.sheets?.some((sheet) => sheet.properties?.title === sheetName);
        if (!sheetExists) {
            // Create the sheet
            await retryApiCall(() => svc.spreadsheets.batchUpdate({
                spreadsheetId: SHEET_ID,
                requestBody: {
                    requests: [{
                            addSheet: {
                                properties: {
                                    title: sheetName
                                }
                            }
                        }]
                }
            }));
            console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Created sheet: ${sheetName}`);
        }
        // Add headers based on sheet type
        let headers = [];
        switch (sheetName) {
            case 'Withdrawals':
                headers = [
                    'request_id', 'user_id', 'username', 'amount_usd', 'method',
                    'payment_tag_or_address', 'request_timestamp_iso', 'approved_by_user_id',
                    'approved_at_iso', 'status', 'payout_type', 'notes'
                ];
                break;
            case 'OwnerPayouts':
                // Align headers with appendOwnerPayout (10 columns)
                headers = [
                    'payout_id', // A
                    'user_id', // B
                    'username', // C
                    'amount_usd', // D
                    'channel', // E  (e.g., PAYPAL/BTC/ETH)
                    'owner_wallet_or_handle', // F  (club's payout wallet/handle if any)
                    'request_timestamp_iso', // G
                    'paid_at_iso', // H
                    'status', // I
                    'notes' // J
                ];
                break;
            case 'ExternalDeposits':
                headers = [
                    'entry_id', 'user_id', 'username', 'amount_usd', 'method',
                    'reference', 'created_at_iso', 'recorded_by_user_id'
                ];
                break;
            case 'PlayerLedger':
                headers = [
                    'user_id', 'username', 'delta_cents', 'timestamp', 'note'
                ];
                break;
            case 'Settings':
                headers = ['key', 'value'];
                break;
            case 'OwnerAccounts':
                headers = ['method', 'handle', 'display_name', 'instructions'];
                break;
        }
        if (headers.length > 0) {
            // Check if headers already exist
            const headerRes = await retryApiCall(() => svc.spreadsheets.values.get({
                spreadsheetId: SHEET_ID,
                range: `${sheetName}!A1:${String.fromCharCode(65 + headers.length - 1)}1`
            }));
            const existingHeaders = headerRes.data.values?.[0] || [];
            if (existingHeaders.length === 0) {
                // Add headers
                await retryApiCall(() => svc.spreadsheets.values.update({
                    spreadsheetId: SHEET_ID,
                    range: `${sheetName}!A1`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [headers] }
                }));
                console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Added headers to ${sheetName}`);
            }
        }
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to ensure sheet headers for ${sheetName}:`, error);
        throw error;
    }
}
// Legacy functions for backward compatibility
export async function appendWithdrawalRow(row) {
    if (row.payout_type === 'OWNER') {
        return appendWithdrawalOwner(row);
    }
    else {
        return appendWithdrawalCircle(row);
    }
}
export async function markCashoutMatchedByRow(rowIndex, newStatus = 'matched') {
    // This function is deprecated - use updateWithdrawalStatusById instead
    console.warn(`[${new Date().toISOString()}] [${CLIENT_NAME}] markCashoutMatchedByRow is deprecated, use updateWithdrawalStatusById`);
    throw new Error('markCashoutMatchedByRow is deprecated, use updateWithdrawalStatusById with request_id');
}
export async function markRowPaid(rowIndex, verifiedBy, verifiedAt, newStatus = 'paid') {
    // This function is deprecated - use updateWithdrawalStatusById instead
    console.warn(`[${new Date().toISOString()}] [${CLIENT_NAME}] markRowPaid is deprecated, use updateWithdrawalStatusById`);
    throw new Error('markRowPaid is deprecated, use updateWithdrawalStatusById with request_id');
}
export async function sortWithdrawalsByRequestTime() {
    try {
        const svc = await getSheetsClient();
        // Get sheet metadata
        const meta = await retryApiCall(() => svc.spreadsheets.get({ spreadsheetId: SHEET_ID }));
        const sheet = meta.data.sheets?.find(s => s.properties?.title === 'Withdrawals');
        const sheetId = sheet?.properties?.sheetId;
        if (sheetId == null)
            throw new Error('Withdrawals sheet not found');
        await retryApiCall(() => svc.spreadsheets.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: {
                requests: [{
                        sortRange: {
                            range: { sheetId, startRowIndex: 1 }, // exclude header row
                            sortSpecs: [{ dimensionIndex: 6, sortOrder: 'ASCENDING' }] // column G (request_timestamp_iso)
                        }
                    }]
            }
        }));
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Sorted withdrawals by request time`);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to sort withdrawals:`, error);
        // Don't throw, this is not critical
    }
}
// External deposit logging
export async function appendExternalDeposit(row) {
    try {
        const svc = await getSheetsClient();
        // Ensure ExternalDeposits sheet exists with headers
        await ensureSheetHeaders('ExternalDeposits');
        const depositRow = [
            row.entry_id,
            String(row.user_id),
            row.username,
            String(row.amount_usd),
            row.method,
            row.reference,
            row.created_at_iso,
            String(row.recorded_by_user_id)
        ];
        await retryApiCall(() => svc.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'ExternalDeposits!A:H',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [depositRow] }
        }));
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Added external deposit: ${row.entry_id}`);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to append external deposit:`, error);
        throw error;
    }
}
// Owner payout marking as paid
export async function markOwnerPayoutPaid(payoutId, markedByUserId, note) {
    try {
        const svc = await getSheetsClient();
        // Find the payout in OwnerPayouts sheet
        const res = await retryApiCall(() => svc.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'OwnerPayouts!A:I'
        }));
        const rows = res.data.values || [];
        let rowIndex = -1;
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] === payoutId) {
                rowIndex = i + 1; // Convert to 1-based index
                break;
            }
        }
        if (rowIndex === -1) {
            throw new Error(`Owner payout ${payoutId} not found`);
        }
        // Columns:
        // A payout_id, B user_id, C username, D amount_usd, E channel,
        // F owner_wallet_or_handle, G request_timestamp_iso, H paid_at_iso,
        // I status, J notes
        await retryApiCall(() => svc.spreadsheets.values.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: [
                    { range: `OwnerPayouts!H${rowIndex}`, values: [[new Date().toISOString()]] }, // paid_at_iso
                    { range: `OwnerPayouts!I${rowIndex}`, values: [['PAID']] }, // status
                    { range: `OwnerPayouts!J${rowIndex}`, values: [[note || `Marked by ${markedByUserId}`]] } // notes
                ]
            }
        }));
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Marked owner payout as paid: ${payoutId}`);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to mark owner payout paid:`, error);
        throw error;
    }
}
// Ledger functions
export async function upsertLedger(userId, username, deltaCents, note) {
    try {
        const svc = await getSheetsClient();
        // Ensure PlayerLedger sheet exists with headers
        await ensureSheetHeaders('PlayerLedger');
        const timestamp = new Date().toISOString();
        const ledgerRow = [
            String(userId),
            username,
            String(deltaCents),
            timestamp,
            note
        ];
        await retryApiCall(() => svc.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'PlayerLedger!A:E',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [ledgerRow] }
        }));
        // Calculate new balance
        const balance = await getLedgerBalance(userId);
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Updated ledger for user ${userId}: ${deltaCents} cents, new balance: ${balance} cents`);
        return balance;
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to upsert ledger:`, error);
        throw error;
    }
}
export async function getLedgerBalance(userId) {
    try {
        const svc = await getSheetsClient();
        // Get all ledger entries for this user
        const res = await retryApiCall(() => svc.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'PlayerLedger!A:C'
        }));
        const rows = res.data.values || [];
        let balance = 0;
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row[0] === String(userId)) {
                balance += Number(row[2]) || 0;
            }
        }
        return balance;
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to get ledger balance:`, error);
        return 0; // Return 0 if sheet access fails
    }
}
// Stale withdrawal marking
export async function markStaleCashAppCircleWithdrawals(staleHours) {
    try {
        const svc = await getSheetsClient();
        const res = await retryApiCall(() => svc.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'Withdrawals!A:L'
        }));
        const rows = res.data.values || [];
        const now = new Date();
        const staleThreshold = new Date(now.getTime() - (staleHours * 60 * 60 * 1000));
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const method = row[4]; // method column
            const status = row[9]; // status column
            const requestTime = row[6]; // request_timestamp_iso column
            const payoutType = row[10]; // payout_type column
            // Only mark CASHAPP circle withdrawals as stale
            if (method === 'CASHAPP' && status === 'QUEUED' && payoutType === 'CIRCLE') {
                try {
                    const requestDate = new Date(requestTime);
                    if (requestDate < staleThreshold) {
                        // Mark as stale
                        await retryApiCall(() => svc.spreadsheets.values.update({
                            spreadsheetId: SHEET_ID,
                            range: `Withdrawals!J${i + 1}`,
                            valueInputOption: 'USER_ENTERED',
                            requestBody: { values: [['STALE']] }
                        }));
                        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Marked stale withdrawal: ${row[0]}`);
                    }
                }
                catch (error) {
                    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to mark withdrawal stale:`, error);
                }
            }
        }
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to mark stale withdrawals:`, error);
    }
}
// Legacy functions for backward compatibility
