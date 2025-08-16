import { google } from 'googleapis';
import { SHEET_ID, METHODS_ENABLED_DEFAULT, DEFAULT_CURRENCY, DEFAULT_FAST_FEE, OWNER_FALLBACK_THRESHOLD, OWNER_TG_USERNAME, ZELLE_HANDLE, VENMO_HANDLE, CASHAPP_HANDLE, PAYPAL_HANDLE, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, SHEETS_RATE_LIMIT_MS, CLIENT_NAME, METHODS_CIRCLE, METHODS_EXTERNAL_LINK, STRIPE_CHECKOUT_URL, WITHDRAW_STALE_HOURS, APPLE_PAY_HANDLE, PAYPAL_EMAIL, CRYPTO_WALLET_BTC, CRYPTO_WALLET_ETH, CRYPTO_WALLET, CRYPTO_NETWORKS } from './config.js';
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
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    lastApiCall = Date.now();
    return apiCall();
}
// Retry logic for failed API calls
async function retryApiCall(apiCall, maxRetries = 3, baseDelay = 1000) {
    let lastError;
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
async function getClient() {
    if (sheetsClient) {
        return sheetsClient;
    }
    if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
        throw new Error('Google Sheets credentials not configured');
    }
    try {
        const auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            credentials: {
                client_email: GOOGLE_CLIENT_EMAIL,
                private_key: GOOGLE_PRIVATE_KEY
            }
        });
        const authClient = await auth.getClient();
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
        const svc = await getClient();
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
        const svc = await getClient();
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
                    CRYPTO_NETWORKS: map.get('CRYPTO_NETWORKS') ?
                        map.get('CRYPTO_NETWORKS').split(',').map(s => s.trim().toUpperCase()).filter(Boolean) :
                        CRYPTO_NETWORKS
                };
                // Cache the result
                settingsCache = { data: settings, timestamp: now };
                return settings;
            }
        }
        catch (error) {
            console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] No Settings tab found, using fallback:`, error);
            // ignore (no Settings tab)
        }
        // Fallback: use env defaults
        const settings = {
            CLUB_NAME: 'Club',
            METHODS_ENABLED: METHODS_ENABLED_DEFAULT,
            CURRENCY: DEFAULT_CURRENCY,
            FAST_FEE_PCT: DEFAULT_FAST_FEE,
            OWNER_FALLBACK_THRESHOLD,
            OWNER_TG_USERNAME,
            // Real-club ops settings
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
            CRYPTO_NETWORKS: CRYPTO_NETWORKS
        };
        // Cache the result
        settingsCache = { data: settings, timestamp: now };
        return settings;
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to get settings:`, error);
        // Return safe defaults if everything fails
        const settings = {
            CLUB_NAME: 'Club',
            METHODS_ENABLED: METHODS_ENABLED_DEFAULT,
            CURRENCY: DEFAULT_CURRENCY,
            FAST_FEE_PCT: DEFAULT_FAST_FEE,
            OWNER_FALLBACK_THRESHOLD,
            OWNER_TG_USERNAME,
            // Real-club ops settings
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
            CRYPTO_NETWORKS: CRYPTO_NETWORKS
        };
        // Cache the result even for fallback
        settingsCache = { data: settings, timestamp: now };
        return settings;
    }
}
// Legacy function for backward compatibility
export async function getSettings() {
    return getSettingsCached();
}
export async function getOwnerAccounts() {
    try {
        const svc = await getClient();
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
            accounts.push({ method: 'CASHAPP', handle: CASHAPP_HANDLE, display_name: 'Cash App', instructions: 'Send to Cash App handle' });
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
        const svc = await getClient();
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
        const svc = await getClient();
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
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Appended circle withdrawal: ${row.request_id}`);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to append circle withdrawal:`, error);
        throw new Error('Unable to create withdrawal record. Please try again.');
    }
}
export async function appendWithdrawalOwner(row) {
    try {
        const svc = await getClient();
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
            'LOGGED', // status
            'OWNER', // payout_type
            row.notes || ''
        ];
        await retryApiCall(() => svc.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'Withdrawals!A:L',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [withdrawalRow] }
        }));
        // Also append to Owner Payouts sheet
        await appendOwnerPayout({
            payout_id: row.request_id,
            user_id: row.user_id,
            username: row.username,
            amount_usd: row.amount_usd,
            channel: row.method,
            owner_wallet_or_handle: row.payment_tag_or_address,
            request_timestamp_iso: row.request_timestamp_iso,
            status: 'PENDING',
            notes: row.notes
        });
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Appended owner withdrawal: ${row.request_id}`);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to append owner withdrawal:`, error);
        throw new Error('Unable to create withdrawal record. Please try again.');
    }
}
export async function updateWithdrawalStatusById(requestId, status, notes) {
    try {
        const svc = await getClient();
        // Find the withdrawal row
        const res = await retryApiCall(() => svc.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'Withdrawals!A2:L'
        }));
        const rows = res.data.values || [];
        let rowIndex = 2;
        for (const row of rows) {
            if (row[0] === requestId) {
                // Update status (column J = index 9) and notes (column L = index 11)
                const updates = [
                    { range: `Withdrawals!J${rowIndex}`, value: status },
                    { range: `Withdrawals!L${rowIndex}`, value: notes || '' }
                ];
                for (const update of updates) {
                    await retryApiCall(() => svc.spreadsheets.values.update({
                        spreadsheetId: SHEET_ID,
                        range: update.range,
                        valueInputOption: 'RAW',
                        requestBody: { values: [[update.value]] }
                    }));
                }
                // Invalidate cache immediately
                invalidateCashoutsCache();
                console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Updated withdrawal status: ${requestId} -> ${status}`);
                return;
            }
            rowIndex++;
        }
        throw new Error(`Withdrawal ${requestId} not found`);
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
        const svc = await getClient();
        // Ensure Owner Payouts sheet exists with headers
        await ensureSheetHeaders('Owner Payouts');
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
            range: 'Owner Payouts!A:J',
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
        const svc = await getClient();
        // Check if sheet exists
        const meta = await retryApiCall(() => svc.spreadsheets.get({ spreadsheetId: SHEET_ID }));
        const sheetExists = meta.data.sheets?.some(s => s.properties?.title === sheetName);
        if (!sheetExists) {
            // Create sheet
            await retryApiCall(() => svc.spreadsheets.batchUpdate({
                spreadsheetId: SHEET_ID,
                requestBody: {
                    requests: [{
                            addSheet: {
                                properties: { title: sheetName }
                            }
                        }]
                }
            }));
            console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Created sheet: ${sheetName}`);
        }
        // Set headers based on sheet type
        let headers = [];
        if (sheetName === 'Withdrawals') {
            headers = [
                'request_id', 'user_id', 'username', 'amount_usd', 'method',
                'payment_tag_or_address', 'request_timestamp_iso', 'approved_by_user_id',
                'approved_at_iso', 'status', 'payout_type', 'notes'
            ];
        }
        else if (sheetName === 'Owner Payouts') {
            headers = [
                'payout_id', 'user_id', 'username', 'amount_usd', 'channel',
                'owner_wallet_or_handle', 'request_timestamp_iso', 'paid_at_iso', 'status', 'notes'
            ];
        }
        else if (sheetName === 'Settings') {
            headers = ['key', 'value'];
        }
        if (headers.length > 0) {
            await retryApiCall(() => svc.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${sheetName}!A1:${String.fromCharCode(65 + headers.length - 1)}1`,
                valueInputOption: 'RAW',
                requestBody: { values: [headers] }
            }));
            console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Set headers for ${sheetName}`);
        }
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to ensure sheet headers:`, error);
        // Don't throw, this is not critical
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
        const svc = await getClient();
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
