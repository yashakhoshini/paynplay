import { google } from 'googleapis';
import { SHEET_ID, DEFAULT_METHODS, DEFAULT_CURRENCY, DEFAULT_FAST_FEE, OWNER_FALLBACK_THRESHOLD, OWNER_TG_USERNAME, ZELLE_HANDLE, VENMO_HANDLE, CASHAPP_HANDLE, PAYPAL_HANDLE, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, SHEETS_RATE_LIMIT_MS, CLIENT_NAME } from './config.js';
import { inferMapping, buildCanonicalRows, isOpenCashout } from './schemaMapper.js';
// Rate limiting for Google Sheets API calls
let lastApiCall = 0;
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
// Only create auth if credentials are provided
let auth = null;
if (GOOGLE_CLIENT_EMAIL && GOOGLE_PRIVATE_KEY) {
    auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        credentials: {
            client_email: GOOGLE_CLIENT_EMAIL,
            private_key: GOOGLE_PRIVATE_KEY
        }
    });
}
async function client() {
    if (!auth) {
        throw new Error('Google Sheets credentials not configured');
    }
    try {
        const a = await auth.getClient();
        return google.sheets({ version: 'v4', auth: a });
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to create Google Sheets client:`, error);
        throw new Error('Unable to authenticate with Google Sheets. Please check your service account credentials.');
    }
}
// Validate sheet permissions on startup
export async function validateSheetAccess() {
    try {
        const svc = await client();
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
function normalizeHeader(s) {
    return s.trim().toLowerCase();
}
function toNumber(amount) {
    if (typeof amount === 'number')
        return amount;
    const cleaned = amount.replace(/[,$]/g, '').replace(/[^\d.\-]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
}
function normalizeMethod(m) {
    const x = m.trim().toUpperCase();
    if (x === 'ZELLE')
        return 'ZELLE';
    if (x === 'VENMO')
        return 'VENMO';
    if (x === 'CASHAPP' || x === 'CASH APP')
        return 'CASHAPP';
    if (x === 'PAYPAL')
        return 'PAYPAL';
    if (x === 'CASH')
        return ''; // Exclude CASH method
    if (x === 'BANK TRANSFER' || x === 'BANKTRANSFER')
        return ''; // Exclude Bank Transfer method
    return x; // pass-through for other custom methods
}
async function getFirstSheetMeta(svc) {
    try {
        const meta = await retryApiCall(() => svc.spreadsheets.get({ spreadsheetId: SHEET_ID }));
        const sheet = meta.data.sheets?.[0];
        if (!sheet || !sheet.properties?.title) {
            throw new Error('No sheets found in spreadsheet.');
        }
        return { title: sheet.properties.title, sheetId: sheet.properties.sheetId };
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to get sheet metadata:`, error);
        throw new Error('Unable to access spreadsheet. Please check permissions and sheet ID.');
    }
}
export async function getSettings() {
    try {
        const svc = await client();
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
                // Import config values for fallbacks
                const { METHODS_CIRCLE, METHODS_EXTERNAL_LINK, STRIPE_CHECKOUT_URL, WITHDRAW_STALE_HOURS } = await import('./config.js');
                const methods = (map.get('METHODS_ENABLED') || DEFAULT_METHODS.join(','))
                    .split(',')
                    .map((s) => s.trim().toUpperCase())
                    .filter(Boolean)
                    .filter((method) => method !== 'CASH'); // Explicitly exclude CASH
                return {
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
                    WITHDRAW_STALE_HOURS: Number(map.get('WITHDRAW_STALE_HOURS') || WITHDRAW_STALE_HOURS)
                };
            }
        }
        catch (error) {
            console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] No Settings tab found, using fallback:`, error);
            // ignore (no Settings tab)
        }
        // Fallback: infer from first sheet headers and values
        const { title } = await getFirstSheetMeta(svc);
        const res = await retryApiCall(() => svc.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${title}!1:1`,
            valueRenderOption: 'UNFORMATTED_VALUE'
        }));
        const headers = (res.data.values?.[0] || []).map(String);
        const hmap = new Map(headers.map((h, i) => [normalizeHeader(h), i]));
        // Guess methods from Payment Method column
        const pmIdx = hmap.get('payment method');
        let methods = DEFAULT_METHODS;
        if (pmIdx !== undefined) {
            const res2 = await retryApiCall(() => svc.spreadsheets.values.get({
                spreadsheetId: SHEET_ID,
                range: `${title}!${2}:${200}`,
                valueRenderOption: 'UNFORMATTED_VALUE'
            }));
            const vals = res2.data.values || [];
            const uniq = new Set();
            for (const row of vals) {
                const m = row[pmIdx];
                if (m)
                    uniq.add(normalizeMethod(String(m)));
            }
            if (uniq.size)
                methods = Array.from(uniq);
        }
        return {
            CLUB_NAME: 'Club',
            METHODS_ENABLED: methods,
            CURRENCY: DEFAULT_CURRENCY,
            FAST_FEE_PCT: DEFAULT_FAST_FEE,
            OWNER_FALLBACK_THRESHOLD,
            OWNER_TG_USERNAME,
            // Real-club ops settings
            STRIPE_CHECKOUT_URL: '',
            METHODS_CIRCLE: [],
            METHODS_EXTERNAL_LINK: [],
            WITHDRAW_STALE_HOURS: 24
        };
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to get settings:`, error);
        // Return safe defaults if everything fails
        return {
            CLUB_NAME: 'Club',
            METHODS_ENABLED: DEFAULT_METHODS,
            CURRENCY: DEFAULT_CURRENCY,
            FAST_FEE_PCT: DEFAULT_FAST_FEE,
            OWNER_FALLBACK_THRESHOLD,
            OWNER_TG_USERNAME,
            // Real-club ops settings
            STRIPE_CHECKOUT_URL: '',
            METHODS_CIRCLE: [],
            METHODS_EXTERNAL_LINK: [],
            WITHDRAW_STALE_HOURS: 24
        };
    }
}
export async function getOwnerAccounts() {
    try {
        const svc = await client();
        // Try OwnerAccounts sheet if present
        try {
            const res = await retryApiCall(() => svc.spreadsheets.values.get({
                spreadsheetId: SHEET_ID,
                range: 'OwnerAccounts!A1:D999',
                valueRenderOption: 'UNFORMATTED_VALUE'
            }));
            const rows = res.data.values || [];
            const headers = (rows[0] || []).map((h) => normalizeHeader(String(h)));
            const idx = {
                method: headers.indexOf('method'),
                handle: headers.indexOf('handle'),
                display_name: headers.indexOf('display_name'),
                instructions: headers.indexOf('instructions')
            };
            if (idx.method !== -1 && idx.handle !== -1) {
                const out = [];
                for (let i = 1; i < rows.length; i++) {
                    const r = rows[i] || [];
                    const method = normalizeMethod(String(r[idx.method] ?? ''));
                    const handle = String(r[idx.handle] ?? '');
                    if (!method || !handle)
                        continue;
                    out.push({
                        method,
                        handle,
                        display_name: String(r[idx.display_name] ?? 'Owner'),
                        instructions: String(r[idx.instructions] ?? '')
                    });
                }
                if (out.length)
                    return out;
            }
        }
        catch (error) {
            console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] No OwnerAccounts sheet found, using environment variables:`, error);
            // ignore
        }
        // Fallback to env-provided handles
        const out = [];
        if (ZELLE_HANDLE)
            out.push({ method: 'ZELLE', handle: ZELLE_HANDLE, display_name: 'Owner', instructions: '' });
        if (VENMO_HANDLE)
            out.push({ method: 'VENMO', handle: VENMO_HANDLE, display_name: 'Owner', instructions: '' });
        if (CASHAPP_HANDLE)
            out.push({ method: 'CASHAPP', handle: CASHAPP_HANDLE, display_name: 'Owner', instructions: '' });
        if (PAYPAL_HANDLE)
            out.push({ method: 'PAYPAL', handle: PAYPAL_HANDLE, display_name: 'Owner', instructions: '' });
        return out;
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to get owner accounts:`, error);
        return [];
    }
}
// Read open cash-outs using universal schema mapper
export async function getOpenCashouts() {
    try {
        const svc = await client();
        const { title } = await getFirstSheetMeta(svc);
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Reading from sheet:`, title);
        const res = await retryApiCall(() => svc.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${title}!1:10000`,
            valueRenderOption: 'UNFORMATTED_VALUE'
        }));
        const values = res.data.values || [];
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Total rows in sheet:`, values.length);
        if (values.length < 2) {
            console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Not enough data in sheet`);
            return [];
        }
        const headers = (values[0] || []).map(String);
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Headers found:`, headers);
        const dataRows = values.slice(1); // Skip header row
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Data rows:`, dataRows.length);
        // Use universal schema mapper to infer column mappings
        const mapping = inferMapping(headers, dataRows);
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Sheet mapping confidence: ${mapping.confidence}%`, mapping.cols);
        // Require minimum confidence for reliable mapping
        if (mapping.confidence < 50) {
            console.warn(`[${new Date().toISOString()}] [${CLIENT_NAME}] Low mapping confidence (${mapping.confidence}%), may miss some cashouts`);
        }
        // Build canonical rows using the mapping
        const canonicalRows = buildCanonicalRows(dataRows, mapping);
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Canonical rows built:`, canonicalRows.length);
        // Filter for open cashouts
        const openCashouts = [];
        for (const row of canonicalRows) {
            console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Checking row:`, row);
            if (isOpenCashout(row) && row.paymentMethod && row.amount) {
                console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Found open cashout:`, row);
                openCashouts.push({
                    rowIndex: row.rowIndex,
                    username: row.username || '',
                    method: row.paymentMethod,
                    amount: row.amount,
                    status: row.status || 'pending',
                    receiver_handle: row.receiver || '',
                    timestamp: row.timestamp || '',
                    priority: row.priority || ''
                });
            }
        }
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Total open cashouts found:`, openCashouts.length);
        return openCashouts;
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to get open cashouts:`, error);
        throw new Error('Unable to read cashout data. Please check sheet permissions and format.');
    }
}
export async function markCashoutMatchedByRow(rowIndex, newStatus = 'matched') {
    try {
        await markRowPaid(rowIndex, 0, new Date().toISOString(), newStatus);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to mark cashout matched:`, error);
        throw error;
    }
}
// Mark a row as paid with verification details
export async function markRowPaid(rowIndex, verifiedBy, verifiedAt, newStatus = 'paid') {
    try {
        const svc = await client();
        const { title } = await getFirstSheetMeta(svc);
        // Get headers to find relevant columns
        const head = await retryApiCall(() => svc.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${title}!1:1`,
            valueRenderOption: 'UNFORMATTED_VALUE'
        }));
        const headers = (head.data.values?.[0] || []).map(String);
        // Use schema mapper to find column indices
        const mapping = inferMapping(headers, []);
        // Helper function to convert column index to letter
        const colLetter = (i) => {
            let n = i + 1, s = '';
            while (n) {
                n--;
                s = String.fromCharCode(65 + (n % 26)) + s;
                n = Math.floor(n / 26);
            }
            return s;
        };
        // Update Status column if it exists
        if (mapping.cols.status !== undefined) {
            const statusCol = colLetter(mapping.cols.status);
            try {
                await retryApiCall(() => svc.spreadsheets.values.update({
                    spreadsheetId: SHEET_ID,
                    range: `${title}!${statusCol}${rowIndex}`,
                    valueInputOption: 'RAW',
                    requestBody: { values: [[newStatus]] }
                }));
                console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Updated status to ${newStatus} at row ${rowIndex}`);
            }
            catch (error) {
                console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to update status:`, error);
                throw error;
            }
        }
        // Update verified_by column if it exists
        if (mapping.cols.verifiedBy !== undefined && verifiedBy > 0) {
            const verifiedByCol = colLetter(mapping.cols.verifiedBy);
            try {
                await retryApiCall(() => svc.spreadsheets.values.update({
                    spreadsheetId: SHEET_ID,
                    range: `${title}!${verifiedByCol}${rowIndex}`,
                    valueInputOption: 'RAW',
                    requestBody: { values: [[verifiedBy]] }
                }));
                console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Updated verified_by to ${verifiedBy} at row ${rowIndex}`);
            }
            catch (error) {
                console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to update verified_by:`, error);
                // Don't throw here, status update is more important
            }
        }
        // Update verified_at column if it exists
        if (mapping.cols.verifiedAt !== undefined) {
            const verifiedAtCol = colLetter(mapping.cols.verifiedAt);
            try {
                await retryApiCall(() => svc.spreadsheets.values.update({
                    spreadsheetId: SHEET_ID,
                    range: `${title}!${verifiedAtCol}${rowIndex}`,
                    valueInputOption: 'RAW',
                    requestBody: { values: [[verifiedAt]] }
                }));
                console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Updated verified_at to ${verifiedAt} at row ${rowIndex}`);
            }
            catch (error) {
                console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to update verified_at:`, error);
                // Don't throw here, status update is more important
            }
        }
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to mark row paid:`, error);
        throw error;
    }
}
// Back-compat shim for old code
export async function markCashoutMatched(cashout_id, _payerId) {
    // now we mark by row instead of id; no-op here (matcher will call markCashoutMatchedByRow)
}
// Load roles from Roles sheet
export async function getRolesFromSheet() {
    try {
        const svc = await client();
        try {
            const res = await retryApiCall(() => svc.spreadsheets.values.get({
                spreadsheetId: SHEET_ID,
                range: 'Roles!A1:C999',
                valueRenderOption: 'UNFORMATTED_VALUE'
            }));
            const rows = res.data.values || [];
            const headers = (rows[0] || []).map((h) => normalizeHeader(String(h)));
            const idx = {
                tg_user_id: headers.indexOf('tg_user_id'),
                role: headers.indexOf('role'),
                display_name: headers.indexOf('display_name')
            };
            if (idx.tg_user_id === -1 || idx.role === -1) {
                return [];
            }
            const out = [];
            for (let i = 1; i < rows.length; i++) {
                const r = rows[i] || [];
                const tgUserId = Number(r[idx.tg_user_id]);
                const role = String(r[idx.role] ?? '').toLowerCase();
                if (!tgUserId || isNaN(tgUserId) || !['owner', 'loader'].includes(role)) {
                    continue;
                }
                out.push({
                    tg_user_id: tgUserId,
                    role: role,
                    display_name: String(r[idx.display_name] ?? '')
                });
            }
            return out;
        }
        catch (error) {
            console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] No Roles tab found:`, error);
            // ignore (no Roles tab)
            return [];
        }
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to get roles from sheet:`, error);
        return [];
    }
}
// Withdrawal functions
export async function createPendingWithdrawal(requestId, userId, username, amountUSD, method, tag, requestTimestampISO) {
    try {
        const svc = await client();
        // Ensure PendingWithdrawals sheet exists with headers
        await ensureSheetHeaders('PendingWithdrawals');
        const pendingRow = [
            requestId,
            String(userId),
            username,
            String(amountUSD),
            method,
            tag,
            requestTimestampISO
        ];
        await retryApiCall(() => svc.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'PendingWithdrawals!A:G',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [pendingRow] }
        }));
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Created pending withdrawal: ${requestId}`);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to create pending withdrawal:`, error);
        throw new Error('Unable to create withdrawal request. Please try again.');
    }
}
export async function getPendingWithdrawal(requestId) {
    try {
        const svc = await client();
        const res = await retryApiCall(() => svc.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'PendingWithdrawals!A2:G'
        }));
        const rows = res.data.values || [];
        let rowIndex = 2;
        for (const row of rows) {
            if (row[0] === requestId) {
                return { rowIndex, rowValues: row };
            }
            rowIndex++;
        }
        return null;
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to get pending withdrawal:`, error);
        throw new Error('Unable to retrieve withdrawal request.');
    }
}
export async function confirmWithdrawal(requestId, userId, username, amountUSD, method, tag, requestTimestampISO, approvedByUserId) {
    try {
        const svc = await client();
        // Ensure Withdrawals sheet exists with headers
        await ensureSheetHeaders('Withdrawals');
        const approvedAtISO = new Date().toISOString();
        const finalRow = [
            requestId,
            String(userId),
            username,
            String(amountUSD),
            method,
            tag,
            requestTimestampISO,
            String(approvedByUserId),
            approvedAtISO,
            'Queued'
        ];
        // Append to Withdrawals
        await retryApiCall(() => svc.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'Withdrawals!A:J',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [finalRow] }
        }));
        // Delete from Pending
        await deletePendingWithdrawalRow(requestId);
        // Sort Withdrawals by request_timestamp_iso (column G = index 6)
        await sortWithdrawalsSheet();
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Confirmed withdrawal: ${requestId}`);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to confirm withdrawal:`, error);
        throw new Error('Unable to confirm withdrawal. Please try again.');
    }
}
async function deletePendingWithdrawalRow(requestId) {
    try {
        const svc = await client();
        // Find the row to delete
        const pending = await getPendingWithdrawal(requestId);
        if (!pending)
            return;
        // Get sheet metadata
        const meta = await retryApiCall(() => svc.spreadsheets.get({ spreadsheetId: SHEET_ID }));
        const sheet = meta.data.sheets?.find(s => s.properties?.title === 'PendingWithdrawals');
        const sheetId = sheet?.properties?.sheetId;
        if (sheetId == null)
            throw new Error('PendingWithdrawals sheet not found');
        await retryApiCall(() => svc.spreadsheets.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: {
                requests: [{
                        deleteDimension: {
                            range: {
                                sheetId,
                                dimension: 'ROWS',
                                startIndex: pending.rowIndex - 1,
                                endIndex: pending.rowIndex
                            }
                        }
                    }]
            }
        }));
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to delete pending withdrawal row:`, error);
        // Don't throw, this is not critical
    }
}
async function sortWithdrawalsSheet() {
    try {
        const svc = await client();
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
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to sort withdrawals sheet:`, error);
        // Don't throw, this is not critical
    }
}
async function ensureSheetHeaders(sheetName) {
    try {
        const svc = await client();
        const expectedHeaders = {
            'PendingWithdrawals': ['request_id', 'user_id', 'username', 'amount_usd', 'method', 'payment_tag', 'request_timestamp_iso'],
            'Withdrawals': ['request_id', 'user_id', 'username', 'amount_usd', 'method', 'payment_tag_or_address', 'request_timestamp_iso', 'approved_by_user_id', 'approved_at_iso', 'status', 'payout_type', 'notes'],
            'OwnerPayouts': ['payout_id', 'user_id', 'username', 'amount_usd', 'channel', 'owner_wallet_or_handle', 'request_timestamp_iso', 'approved_by_user_id', 'approved_at_iso', 'status', 'notes'],
            'ExternalDeposits': ['entry_id', 'user_id', 'username', 'amount_usd', 'method', 'reference', 'created_at_iso', 'recorded_by_user_id'],
            'PlayerLedger': ['user_id', 'username', 'balance_cents', 'updated_at_iso', 'note']
        }[sheetName] || [];
        if (expectedHeaders.length === 0)
            return;
        const res = await retryApiCall(() => svc.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${sheetName}!A1:Z1`
        }));
        const current = res.data.values?.[0] || [];
        if (expectedHeaders.join('|') !== current.join('|')) {
            await retryApiCall(() => svc.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${sheetName}!A1:${String.fromCharCode(64 + expectedHeaders.length)}1`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [expectedHeaders] }
            }));
            console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Created/updated headers for ${sheetName} sheet`);
        }
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to ensure sheet headers for ${sheetName}:`, error);
        throw error;
    }
}
// Real-club ops: Withdrawals functions
export async function appendWithdrawalRow(row) {
    try {
        const svc = await client();
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
            row.status,
            row.payout_type,
            row.notes || ''
        ];
        await retryApiCall(() => svc.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'Withdrawals!A:L',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [withdrawalRow] }
        }));
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Appended withdrawal row: ${row.request_id}`);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to append withdrawal row:`, error);
        throw new Error('Unable to create withdrawal record. Please try again.');
    }
}
export async function updateWithdrawalStatus(requestId, status, notes) {
    try {
        const svc = await client();
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
export async function sortWithdrawalsByRequestTime() {
    try {
        const svc = await client();
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
// Real-club ops: Owner payouts functions
export async function appendOwnerPayout(row) {
    try {
        const svc = await client();
        // Ensure OwnerPayouts sheet exists with headers
        await ensureSheetHeaders('OwnerPayouts');
        const payoutRow = [
            row.payout_id,
            String(row.user_id),
            row.username,
            String(row.amount_usd),
            row.channel,
            row.owner_wallet_or_handle,
            row.request_timestamp_iso,
            row.approved_by_user_id ? String(row.approved_by_user_id) : '',
            row.approved_at_iso || '',
            row.status,
            row.notes || ''
        ];
        await retryApiCall(() => svc.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'OwnerPayouts!A:K',
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
export async function markOwnerPayoutPaid(payoutId, approvedBy, notes) {
    try {
        const svc = await client();
        // Find the payout row
        const res = await retryApiCall(() => svc.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'OwnerPayouts!A2:K'
        }));
        const rows = res.data.values || [];
        let rowIndex = 2;
        for (const row of rows) {
            if (row[0] === payoutId) {
                const approvedAtISO = new Date().toISOString();
                // Update status (column J = index 9), approved_by (column H = index 7), approved_at (column I = index 8), notes (column K = index 10)
                const updates = [
                    { range: `OwnerPayouts!J${rowIndex}`, value: 'PAID' },
                    { range: `OwnerPayouts!H${rowIndex}`, value: String(approvedBy) },
                    { range: `OwnerPayouts!I${rowIndex}`, value: approvedAtISO },
                    { range: `OwnerPayouts!K${rowIndex}`, value: notes || '' }
                ];
                for (const update of updates) {
                    await retryApiCall(() => svc.spreadsheets.values.update({
                        spreadsheetId: SHEET_ID,
                        range: update.range,
                        valueInputOption: 'RAW',
                        requestBody: { values: [[update.value]] }
                    }));
                }
                console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Marked owner payout paid: ${payoutId}`);
                return;
            }
            rowIndex++;
        }
        throw new Error(`Owner payout ${payoutId} not found`);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to mark owner payout paid:`, error);
        throw error;
    }
}
// Real-club ops: External deposits functions
export async function appendExternalDeposit(row) {
    try {
        const svc = await client();
        // Ensure ExternalDeposits sheet exists with headers
        await ensureSheetHeaders('ExternalDeposits');
        const depositRow = [
            row.entry_id,
            String(row.user_id),
            row.username,
            String(row.amount_usd),
            row.method,
            row.reference || '',
            row.created_at_iso,
            String(row.recorded_by_user_id)
        ];
        await retryApiCall(() => svc.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'ExternalDeposits!A:H',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [depositRow] }
        }));
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Appended external deposit: ${row.entry_id}`);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to append external deposit:`, error);
        throw new Error('Unable to log external deposit. Please try again.');
    }
}
// Real-club ops: Ledger functions
export async function upsertLedger(user_id, username, deltaCents, note) {
    try {
        const svc = await client();
        // Ensure PlayerLedger sheet exists with headers
        await ensureSheetHeaders('PlayerLedger');
        // Check if user already has a ledger entry
        const res = await retryApiCall(() => svc.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'PlayerLedger!A2:E'
        }));
        const rows = res.data.values || [];
        let existingRowIndex = -1;
        let currentBalanceCents = 0;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (Number(row[0]) === user_id) {
                existingRowIndex = i + 2; // 1-based + header row
                currentBalanceCents = Number(row[2]) || 0;
                break;
            }
        }
        const newBalanceCents = currentBalanceCents + deltaCents;
        const updatedAtISO = new Date().toISOString();
        if (existingRowIndex > 0) {
            // Update existing row
            const updates = [
                { range: `PlayerLedger!C${existingRowIndex}`, value: String(newBalanceCents) },
                { range: `PlayerLedger!D${existingRowIndex}`, value: updatedAtISO },
                { range: `PlayerLedger!E${existingRowIndex}`, value: note }
            ];
            for (const update of updates) {
                await retryApiCall(() => svc.spreadsheets.values.update({
                    spreadsheetId: SHEET_ID,
                    range: update.range,
                    valueInputOption: 'RAW',
                    requestBody: { values: [[update.value]] }
                }));
            }
        }
        else {
            // Create new row
            const newRow = [
                String(user_id),
                username,
                String(newBalanceCents),
                updatedAtISO,
                note
            ];
            await retryApiCall(() => svc.spreadsheets.values.append({
                spreadsheetId: SHEET_ID,
                range: 'PlayerLedger!A:E',
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [newRow] }
            }));
        }
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Updated ledger for user ${user_id}: ${currentBalanceCents} + ${deltaCents} = ${newBalanceCents} cents`);
        return newBalanceCents;
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to upsert ledger:`, error);
        throw new Error('Unable to update player ledger. Please try again.');
    }
}
export async function getLedgerBalance(user_id) {
    try {
        const svc = await client();
        const res = await retryApiCall(() => svc.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'PlayerLedger!A2:E'
        }));
        const rows = res.data.values || [];
        for (const row of rows) {
            if (Number(row[0]) === user_id) {
                return Number(row[2]) || 0;
            }
        }
        return 0; // No ledger entry found, balance is 0
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to get ledger balance:`, error);
        return 0; // Return 0 on error
    }
}
// Real-club ops: Stale handling
export async function markStaleCashAppCircleWithdrawals(staleHours) {
    try {
        const svc = await client();
        const res = await retryApiCall(() => svc.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'Withdrawals!A2:L'
        }));
        const rows = res.data.values || [];
        const staleThreshold = new Date(Date.now() - staleHours * 60 * 60 * 1000).toISOString();
        let staleCount = 0;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const method = row[4]; // method column
            const payoutType = row[10]; // payout_type column
            const status = row[9]; // status column
            const requestTime = row[6]; // request_timestamp_iso column
            if (method === 'CASHAPP' &&
                payoutType === 'CIRCLE' &&
                status === 'QUEUED' &&
                requestTime < staleThreshold) {
                // Mark as stale
                const rowIndex = i + 2; // 1-based + header row
                const note = `Marked stale after ${staleHours} hours`;
                const updates = [
                    { range: `Withdrawals!J${rowIndex}`, value: 'STALE' },
                    { range: `Withdrawals!L${rowIndex}`, value: note }
                ];
                for (const update of updates) {
                    await retryApiCall(() => svc.spreadsheets.values.update({
                        spreadsheetId: SHEET_ID,
                        range: update.range,
                        valueInputOption: 'RAW',
                        requestBody: { values: [[update.value]] }
                    }));
                }
                staleCount++;
                console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Marked withdrawal ${row[0]} as stale`);
            }
        }
        if (staleCount > 0) {
            console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Marked ${staleCount} Cash App circle withdrawals as stale`);
        }
        return staleCount;
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to mark stale withdrawals:`, error);
        return 0;
    }
}
// Mark buy-in as paid with verification details
export async function markBuyinPaid(buyinId, verifiedBy, proofMsgId, proofChatId) {
    try {
        const svc = await client();
        const { title } = await getFirstSheetMeta(svc);
        // Try to find relevant columns
        const head = await retryApiCall(() => svc.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${title}!1:1`,
            valueRenderOption: 'UNFORMATTED_VALUE'
        }));
        const headers = (head.data.values?.[0] || []).map(String);
        const hmap = new Map(headers.map((h, i) => [normalizeHeader(h), i]));
        // Find buy-in row by ID
        const res = await retryApiCall(() => svc.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${title}!1:10000`,
            valueRenderOption: 'UNFORMATTED_VALUE'
        }));
        const values = res.data.values || [];
        let buyinRowIndex = -1;
        const buyinIdIdx = hmap.get('buyin_id') ?? hmap.get('buyin id') ?? hmap.get('id');
        if (buyinIdIdx !== undefined) {
            for (let r = 1; r < values.length; r++) {
                const row = values[r] || [];
                if (String(row[buyinIdIdx] ?? '') === buyinId) {
                    buyinRowIndex = r + 1; // 1-based
                    break;
                }
            }
        }
        if (buyinRowIndex === -1) {
            console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Buy-in ${buyinId} not found in sheet`);
            return;
        }
        // Update status and verification fields
        const updates = [
            { col: 'status', value: 'paid' },
            { col: 'verified_by', value: verifiedBy },
            { col: 'verified_at', value: new Date().toISOString() }
        ];
        if (proofMsgId && proofChatId) {
            updates.push({ col: 'proof_msg_id', value: proofMsgId });
            updates.push({ col: 'proof_chat_id', value: proofChatId });
        }
        // Apply updates
        for (const update of updates) {
            const colIdx = hmap.get(update.col);
            if (colIdx === undefined)
                continue; // Skip if column doesn't exist
            const colLetter = (i) => {
                let n = i + 1, s = '';
                while (n) {
                    n--;
                    s = String.fromCharCode(65 + (n % 26)) + s;
                    n = Math.floor(n / 26);
                }
                return s;
            };
            const col = colLetter(colIdx);
            await retryApiCall(() => svc.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${title}!${col}${buyinRowIndex}`,
                valueInputOption: 'RAW',
                requestBody: { values: [[update.value]] }
            }));
        }
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Marked buy-in ${buyinId} as paid`);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to mark buy-in paid:`, error);
        throw error;
    }
}
