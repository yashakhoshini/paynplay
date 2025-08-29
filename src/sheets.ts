import { google, sheets_v4 } from 'googleapis';
import { getClient } from './googleClient.js';
import {
  SHEET_ID,
  METHODS_ENABLED_DEFAULT,
  DEFAULT_CURRENCY,
  DEFAULT_FAST_FEE,
  OWNER_FALLBACK_THRESHOLD,
  OWNER_TG_USERNAME,
  ZELLE_HANDLE, VENMO_HANDLE, CASHAPP_HANDLE, PAYPAL_HANDLE,
  SHEETS_RATE_LIMIT_MS,
  CLIENT_NAME,
  METHODS_CIRCLE,
  METHODS_EXTERNAL_LINK,
  STRIPE_CHECKOUT_URL,
  WITHDRAW_STALE_HOURS,
  APPLE_PAY_HANDLE,
  PAYPAL_EMAIL,
  CRYPTO_WALLET_BTC,
  CRYPTO_WALLET_ETH,
  CRYPTO_WALLET,
  CRYPTO_NETWORKS
} from './config.js';
import { OwnerAccount, UserRole, Settings } from './types.js';

type Sheets = sheets_v4.Sheets;

// Singleton Google Sheets client
let sheetsClient: Sheets | null = null;
let lastApiCall = 0;

// Cache for Settings (60s TTL)
let settingsCache: {
  data: any;
  timestamp: number;
} | null = null;
const SETTINGS_CACHE_TTL = 60000; // 60 seconds

// Cache for open circle cashouts (5s TTL)
let openCashoutsCache: {
  data: any[];
  timestamp: number;
} | null = null;
const CASHOUTS_CACHE_TTL = 5000; // 5 seconds

// Rate limiting for Google Sheets API calls
async function rateLimitedApiCall<T>(apiCall: () => Promise<T>): Promise<T> {
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
async function retryApiCall<T>(
  apiCall: () => Promise<T>, 
  maxRetries: number = 3, 
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await rateLimitedApiCall(apiCall);
    } catch (error) {
      lastError = error as Error;
      console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] API call failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error);
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError!;
}

// Singleton client creation
async function getSheetsClient(): Promise<Sheets> {
  if (sheetsClient) {
    return sheetsClient;
  }
  
  try {
    const authClient = await getClient();
    sheetsClient = google.sheets({ version: 'v4', auth: authClient as any });
    
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Google Sheets client initialized`);
    return sheetsClient;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to create Google Sheets client:`, error);
    throw new Error('Unable to authenticate with Google Sheets. Please check your service account credentials.');
  }
}

// Cache invalidation functions
export function invalidateSettingsCache(): void {
  settingsCache = null;
  console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Settings cache invalidated`);
}

export function invalidateCashoutsCache(): void {
  openCashoutsCache = null;
  console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Cashouts cache invalidated`);
}

// Validate sheet permissions on startup
export async function validateSheetAccess(): Promise<boolean> {
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
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Sheet access validation failed:`, error);
    return false;
  }
}

// Cached settings getter
export async function getSettingsCached(): Promise<Settings> {
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
        const map = new Map<string, string>();
        for (let i = 1; i < rows.length; i++) {
          const [k, v] = rows[i] || [];
          if (!k) continue;
          map.set(String(k).trim().toUpperCase(), String(v ?? '').trim());
        }
        
        const methods = (map.get('METHODS_ENABLED') || METHODS_ENABLED_DEFAULT.join(','))
          .split(',')
          .map((s: string) => s.trim().toUpperCase())
          .filter(Boolean)
          .filter((method: string) => method !== 'CASH'); // Explicitly exclude CASH

        const settings: Settings = {
          CLUB_NAME: map.get('CLUB_NAME') || 'Club',
          METHODS_ENABLED: methods,
          CURRENCY: map.get('CURRENCY') || DEFAULT_CURRENCY,
          FAST_FEE_PCT: Number(map.get('FAST_FEE_PCT') || DEFAULT_FAST_FEE),
          OWNER_FALLBACK_THRESHOLD: Number(map.get('OWNER_FALLBACK_THRESHOLD') || OWNER_FALLBACK_THRESHOLD),
          OWNER_TG_USERNAME: map.get('OWNER_TG_USERNAME') || OWNER_TG_USERNAME,
          // Real-club ops settings (sheet overrides env)
          STRIPE_CHECKOUT_URL: map.get('STRIPE_CHECKOUT_URL') || STRIPE_CHECKOUT_URL,
          METHODS_CIRCLE: map.get('METHODS_CIRCLE') ? 
            map.get('METHODS_CIRCLE')!.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : 
            METHODS_CIRCLE,
          METHODS_EXTERNAL_LINK: map.get('METHODS_EXTERNAL_LINK') ? 
            map.get('METHODS_EXTERNAL_LINK')!.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : 
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
    } catch (error) {
      console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] No Settings tab found, using env defaults:`, error);
      // ignore (no Settings tab)
    }

    // Fallback: use env defaults
    const settings: Settings = {
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
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to get settings:`, error);
    throw error;
  }
}

// Legacy function for backward compatibility
export async function getSettings(): Promise<Settings> {
  return getSettingsCached();
}

export async function getOwnerAccounts(): Promise<OwnerAccount[]> {
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
        const accounts: OwnerAccount[] = [];
        for (let i = 1; i < rows.length; i++) {
          const [method, handle, displayName, instructions] = rows[i] || [];
          if (!method || !handle) continue;
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
    } catch (error) {
      console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] No OwnerAccounts tab found, using env fallbacks:`, error);
      // ignore (no OwnerAccounts tab)
    }

    // Fallback: use env handles
    const accounts: OwnerAccount[] = [];
    if (ZELLE_HANDLE) accounts.push({ method: 'ZELLE', handle: ZELLE_HANDLE, display_name: 'Zelle', instructions: 'Send to Zelle handle' });
    if (VENMO_HANDLE) accounts.push({ method: 'VENMO', handle: VENMO_HANDLE, display_name: 'Venmo', instructions: 'Send to Venmo handle' });
    if (CASHAPP_HANDLE) accounts.push({ method: 'CASHAPP', handle: CASHAPP_HANDLE, display_name: 'CashApp', instructions: 'Send to CashApp handle' });
    if (PAYPAL_HANDLE) accounts.push({ method: 'PAYPAL', handle: PAYPAL_HANDLE, display_name: 'PayPal', instructions: 'Send to PayPal handle' });
    
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Using ${accounts.length} env owner accounts`);
    return accounts;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to get owner accounts:`, error);
    return [];
  }
}

// New function to get open circle cashouts (cached)
export async function getOpenCircleCashoutsCached(): Promise<Array<{
  request_id: string;
  user_id: string;
  username: string;
  method: string;
  amount: number;
  payment_tag_or_address: string;
  request_timestamp_iso: string;
  status: string;
  payout_type: string;
}>> {
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
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to get circle withdrawals:`, error);
    return [];
  }
}

// Legacy function for backward compatibility
export async function getOpenCashouts(): Promise<any[]> {
  return getOpenCircleCashoutsCached();
}

// New withdrawal functions
export async function appendWithdrawalCircle(row: {
  request_id: string;
  user_id: string|number;
  username: string;
  amount_usd: number;
  method: string;
  payment_tag_or_address: string;
  request_timestamp_iso: string;
  notes?: string;
}): Promise<void> {
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
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to append circle withdrawal:`, error);
    throw error;
  }
}

export async function appendWithdrawalOwner(row: {
  request_id: string;
  user_id: string|number;
  username: string;
  amount_usd: number;
  method: string;
  payment_tag_or_address: string;
  request_timestamp_iso: string;
  notes?: string;
}): Promise<void> {
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
      row.request_id,
      String(row.user_id),
      row.username,
      String(row.amount_usd),
      row.method,
      row.payment_tag_or_address,
      row.request_timestamp_iso,
      'PENDING', // status
      row.notes || ''
    ];

    await retryApiCall(() => svc.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'OwnerPayouts!A:I',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [ownerPayoutRow] }
    }));
    
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Added owner withdrawal: ${row.request_id}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to append owner withdrawal:`, error);
    throw error;
  }
}

export async function updateWithdrawalStatusById(requestId: string, newStatus: string, approvedByUserId?: string): Promise<void> {
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
    const updates = [
      { range: `Withdrawals!I${rowIndex}`, values: [[newStatus]] },
      { range: `Withdrawals!G${rowIndex}`, values: [[approvedByUserId || '']] },
      { range: `Withdrawals!H${rowIndex}`, values: [[new Date().toISOString()]] }
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
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to update withdrawal status:`, error);
    throw error;
  }
}

// Legacy function for backward compatibility
export async function updateWithdrawalStatus(requestId: string, status: string, notes?: string): Promise<void> {
  return updateWithdrawalStatusById(requestId, status, notes);
}

// Owner payouts functions
export async function appendOwnerPayout(row: {
  payout_id: string;
  user_id: string|number;
  username: string;
  amount_usd: number;
  channel: string; // PAYPAL | BTC | ETH | ...
  owner_wallet_or_handle: string;
  request_timestamp_iso: string;
  status: 'PENDING'|'PAID'|'CANCELLED';
  notes?: string;
}): Promise<void> {
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
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to append owner payout:`, error);
    throw new Error('Unable to create owner payout record. Please try again.');
  }
}

// Helper function to ensure sheet headers exist
async function ensureSheetHeaders(sheetName: string): Promise<void> {
  try {
    const svc = await getSheetsClient();
    
    // Check if sheet exists
    const meta = await retryApiCall(() => svc.spreadsheets.get({ spreadsheetId: SHEET_ID }));
    const sheetExists = meta.data.sheets?.some((sheet: any) => sheet.properties?.title === sheetName);
    
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
    let headers: string[] = [];
    
    switch (sheetName) {
      case 'Withdrawals':
        headers = [
          'request_id', 'user_id', 'username', 'amount_usd', 'method', 
          'payment_tag_or_address', 'request_timestamp_iso', 'approved_by_user_id', 
          'approved_at_iso', 'status', 'payout_type', 'notes'
        ];
        break;
      case 'OwnerPayouts':
        headers = [
          'request_id', 'user_id', 'username', 'amount_usd', 'method', 
          'payment_tag_or_address', 'request_timestamp_iso', 'status', 'notes'
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
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to ensure sheet headers for ${sheetName}:`, error);
    throw error;
  }
}

// Legacy functions for backward compatibility
export async function appendWithdrawalRow(row: any): Promise<void> {
  if (row.payout_type === 'OWNER') {
    return appendWithdrawalOwner(row);
  } else {
    return appendWithdrawalCircle(row);
  }
}

export async function markCashoutMatchedByRow(rowIndex: number, newStatus = 'matched'): Promise<void> {
  // This function is deprecated - use updateWithdrawalStatusById instead
  console.warn(`[${new Date().toISOString()}] [${CLIENT_NAME}] markCashoutMatchedByRow is deprecated, use updateWithdrawalStatusById`);
  throw new Error('markCashoutMatchedByRow is deprecated, use updateWithdrawalStatusById with request_id');
}

export async function markRowPaid(rowIndex: number, verifiedBy: number, verifiedAt: string, newStatus: string = 'paid'): Promise<void> {
  // This function is deprecated - use updateWithdrawalStatusById instead
  console.warn(`[${new Date().toISOString()}] [${CLIENT_NAME}] markRowPaid is deprecated, use updateWithdrawalStatusById`);
  throw new Error('markRowPaid is deprecated, use updateWithdrawalStatusById with request_id');
}

export async function sortWithdrawalsByRequestTime(): Promise<void> {
  try {
    const svc = await getSheetsClient();
    
    // Get sheet metadata
    const meta = await retryApiCall(() => svc.spreadsheets.get({ spreadsheetId: SHEET_ID }));
    const sheet = meta.data.sheets?.find(s => s.properties?.title === 'Withdrawals');
    const sheetId = sheet?.properties?.sheetId;
    if (sheetId == null) throw new Error('Withdrawals sheet not found');

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
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to sort withdrawals:`, error);
    // Don't throw, this is not critical
  }
}

// External deposit logging
export async function appendExternalDeposit(row: {
  entry_id: string;
  user_id: number;
  username: string;
  amount_usd: number;
  method: string;
  reference: string;
  created_at_iso: string;
  recorded_by_user_id: number;
}): Promise<void> {
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
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to append external deposit:`, error);
    throw error;
  }
}

// Owner payout marking as paid
export async function markOwnerPayoutPaid(payoutId: string, markedByUserId: number, note: string): Promise<void> {
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
    
    // Update status to PAID
    await retryApiCall(() => svc.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `OwnerPayouts!H${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['PAID']] }
    }));
    
    // Update notes
    await retryApiCall(() => svc.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `OwnerPayouts!I${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[note]] }
    }));
    
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Marked owner payout as paid: ${payoutId}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to mark owner payout paid:`, error);
    throw error;
  }
}

// Ledger functions
export async function upsertLedger(userId: number, username: string, deltaCents: number, note: string): Promise<number> {
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
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to upsert ledger:`, error);
    throw error;
  }
}

export async function getLedgerBalance(userId: number): Promise<number> {
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
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to get ledger balance:`, error);
    return 0; // Return 0 if sheet access fails
  }
}

// Stale withdrawal marking
export async function markStaleCashAppCircleWithdrawals(staleHours: number): Promise<void> {
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
        } catch (error) {
          console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to mark withdrawal stale:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to mark stale withdrawals:`, error);
  }
}

// Legacy functions for backward compatibility
