import { google, sheets_v4 } from 'googleapis';
import {
  SHEET_ID,
  DEFAULT_METHODS,
  DEFAULT_CURRENCY,
  DEFAULT_FAST_FEE,
  OWNER_FALLBACK_THRESHOLD,
  OWNER_TG_USERNAME,
  ZELLE_HANDLE, VENMO_HANDLE, CASHAPP_HANDLE, PAYPAL_HANDLE,
  GOOGLE_CLIENT_EMAIL,
  GOOGLE_PRIVATE_KEY
} from './config.js';
import { OwnerAccount, UserRole } from './types.js';
import { inferMapping, buildCanonicalRows, isOpenCashout, ColumnMapping, CanonicalRow } from './schemaMapper.js';

type Sheets = sheets_v4.Sheets;

const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  credentials: {
    client_email: GOOGLE_CLIENT_EMAIL,
    private_key: GOOGLE_PRIVATE_KEY
  }
});

async function client(): Promise<Sheets> {
  const a = await auth.getClient();
  return google.sheets({ version: 'v4', auth: a as any });
}

// OwnerAccount type is now imported from types.ts

export type Settings = {
  CLUB_NAME: string;
  METHODS_ENABLED: string[];     // e.g. ['ZELLE','VENMO']
  CURRENCY: string;              // e.g. 'USD'
  FAST_FEE_PCT: number;          // e.g. 0.02
  OWNER_FALLBACK_THRESHOLD: number;
  OWNER_TG_USERNAME: string;
};

export type CashoutRow = {
  rowIndex: number;            // 1-based in Google Sheets
  username?: string;
  method: string;
  amount: number;
  status?: string;
  receiver_handle?: string;    // if present in sheet
  notes?: string;
};

function normalizeHeader(s: string): string {
  return s.trim().toLowerCase();
}

function toNumber(amount: string | number): number {
  if (typeof amount === 'number') return amount;
  const cleaned = amount.replace(/[,$]/g, '').replace(/[^\d.\-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizeMethod(m: string): string {
  const x = m.trim().toUpperCase();
  if (x === 'ZELLE') return 'ZELLE';
  if (x === 'VENMO') return 'VENMO';
  if (x === 'CASHAPP' || x === 'CASH APP') return 'CASHAPP';
  if (x === 'PAYPAL') return 'PAYPAL';
  if (x === 'CASH') return ''; // Exclude CASH method
  if (x === 'BANK TRANSFER' || x === 'BANKTRANSFER') return ''; // Exclude Bank Transfer method
  return x; // pass-through for other custom methods
}

async function getFirstSheetMeta(svc: Sheets) {
  const meta = await svc.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheet = meta.data.sheets?.[0];
  if (!sheet || !sheet.properties?.title) {
    throw new Error('No sheets found in spreadsheet.');
  }
  return { title: sheet.properties.title, sheetId: sheet.properties.sheetId! };
}

export async function getSettings(): Promise<Settings> {
  const svc = await client();

  // Try read Settings!A1:B
  try {
    const res = await svc.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Settings!A1:B999',
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    const rows = res.data.values || [];
    const headers = (rows[0] || []).map(String);
    if (headers[0]?.toLowerCase() === 'key' && headers[1]?.toLowerCase() === 'value') {
      const map = new Map<string, string>();
      for (let i = 1; i < rows.length; i++) {
        const [k, v] = rows[i] || [];
        if (!k) continue;
        map.set(String(k).trim().toUpperCase(), String(v ?? '').trim());
      }
      const methods = (map.get('METHODS_ENABLED') || DEFAULT_METHODS.join(','))
        .split(',')
        .map((s: string) => s.trim().toUpperCase())
        .filter(Boolean)
        .filter((method: string) => method !== 'CASH'); // Explicitly exclude CASH

      return {
        CLUB_NAME: map.get('CLUB_NAME') || 'Club',
        METHODS_ENABLED: methods,
        CURRENCY: map.get('CURRENCY') || DEFAULT_CURRENCY,
        FAST_FEE_PCT: Number(map.get('FAST_FEE_PCT') || DEFAULT_FAST_FEE),
        OWNER_FALLBACK_THRESHOLD: Number(map.get('OWNER_FALLBACK_THRESHOLD') || OWNER_FALLBACK_THRESHOLD),
        OWNER_TG_USERNAME: map.get('OWNER_TG_USERNAME') || OWNER_TG_USERNAME
      };
    }
  } catch (_) {
    // ignore (no Settings tab)
  }

  // Fallback: infer from first sheet headers and values
  const { title } = await getFirstSheetMeta(svc);
  const res = await svc.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${title}!1:1`,
    valueRenderOption: 'UNFORMATTED_VALUE'
  });
  const headers = (res.data.values?.[0] || []).map(String);
  const hmap = new Map(headers.map((h, i) => [normalizeHeader(h), i]));

  // Guess methods from Payment Method column
  const pmIdx = hmap.get('payment method');
  let methods = DEFAULT_METHODS;
  if (pmIdx !== undefined) {
    const res2 = await svc.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${title}!${2}:${200}`,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    const vals = res2.data.values || [];
    const uniq = new Set<string>();
    for (const row of vals) {
      const m = row[pmIdx];
      if (m) uniq.add(normalizeMethod(String(m)));
    }
    if (uniq.size) methods = Array.from(uniq);
  }

  return {
    CLUB_NAME: 'Club',
    METHODS_ENABLED: methods,
    CURRENCY: DEFAULT_CURRENCY,
    FAST_FEE_PCT: DEFAULT_FAST_FEE,
    OWNER_FALLBACK_THRESHOLD,
    OWNER_TG_USERNAME
  };
}

export async function getOwnerAccounts(): Promise<OwnerAccount[]> {
  const svc = await client();

  // Try OwnerAccounts sheet if present
  try {
    const res = await svc.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'OwnerAccounts!A1:D999',
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    const rows = res.data.values || [];
    const headers = (rows[0] || []).map((h) => normalizeHeader(String(h)));
    const idx = {
      method: headers.indexOf('method'),
      handle: headers.indexOf('handle'),
      display_name: headers.indexOf('display_name'),
      instructions: headers.indexOf('instructions')
    };
    if (idx.method !== -1 && idx.handle !== -1) {
      const out: OwnerAccount[] = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const method = normalizeMethod(String(r[idx.method] ?? ''));
        const handle = String(r[idx.handle] ?? '');
        if (!method || !handle) continue;
        out.push({
          method,
          handle,
          display_name: String(r[idx.display_name] ?? 'Owner'),
          instructions: String(r[idx.instructions] ?? '')
        });
      }
      if (out.length) return out;
    }
  } catch (_) {
    // ignore
  }

  // Fallback to env-provided handles
  const out: OwnerAccount[] = [];
  if (ZELLE_HANDLE)   out.push({ method: 'ZELLE',   handle: ZELLE_HANDLE,   display_name: 'Owner', instructions: '' });
  if (VENMO_HANDLE)   out.push({ method: 'VENMO',   handle: VENMO_HANDLE,   display_name: 'Owner', instructions: '' });
  if (CASHAPP_HANDLE) out.push({ method: 'CASHAPP', handle: CASHAPP_HANDLE, display_name: 'Owner', instructions: '' });
  if (PAYPAL_HANDLE)  out.push({ method: 'PAYPAL',  handle: PAYPAL_HANDLE,  display_name: 'Owner', instructions: '' });
  return out;
}

// Read open cash-outs using universal schema mapper
export async function getOpenCashouts(): Promise<CashoutRow[]> {
  const svc = await client();
  const { title } = await getFirstSheetMeta(svc);
  console.log('Reading from sheet:', title);
  
  const res = await svc.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${title}!1:10000`,
    valueRenderOption: 'UNFORMATTED_VALUE'
  });

  const values = res.data.values || [];
  console.log('Total rows in sheet:', values.length);
  
  if (values.length < 2) {
    console.log('Not enough data in sheet');
    return [];
  }

  const headers = (values[0] || []).map(String);
  console.log('Headers found:', headers);
  
  const dataRows = values.slice(1); // Skip header row
  console.log('Data rows:', dataRows.length);

  // Use universal schema mapper to infer column mappings
  const mapping = inferMapping(headers, dataRows);
  console.log(`Sheet mapping confidence: ${mapping.confidence}%`, mapping.cols);

  // Build canonical rows using the mapping
  const canonicalRows = buildCanonicalRows(dataRows, mapping);
  console.log('Canonical rows built:', canonicalRows.length);

  // Filter for open cashouts
  const openCashouts: CashoutRow[] = [];
  for (const row of canonicalRows) {
    console.log('Checking row:', row);
    if (isOpenCashout(row) && row.paymentMethod && row.amount) {
      console.log('Found open cashout:', row);
      openCashouts.push({
        rowIndex: row.rowIndex,
        username: row.username || '',
        method: row.paymentMethod,
        amount: row.amount,
        status: row.status || 'pending',
        receiver_handle: row.receiver || ''
      });
    }
  }

  console.log('Total open cashouts found:', openCashouts.length);
  return openCashouts;
}

export async function markCashoutMatchedByRow(rowIndex: number, newStatus = 'matched'): Promise<void> {
  await markRowPaid(rowIndex, 0, new Date().toISOString(), newStatus);
}

// Mark a row as paid with verification details
export async function markRowPaid(
  rowIndex: number, 
  verifiedBy: number, 
  verifiedAt: string, 
  newStatus: string = 'paid'
): Promise<void> {
  const svc = await client();
  const { title } = await getFirstSheetMeta(svc);

  // Get headers to find relevant columns
  const head = await svc.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${title}!1:1`,
    valueRenderOption: 'UNFORMATTED_VALUE'
  });
  const headers = (head.data.values?.[0] || []).map(String);
  
  // Use schema mapper to find column indices
  const mapping = inferMapping(headers, []);
  
  // Helper function to convert column index to letter
  const colLetter = (i: number): string => {
    let n = i + 1, s = '';
    while (n) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
    return s;
  };

  // Update Status column if it exists
  if (mapping.cols.status !== undefined) {
    const statusCol = colLetter(mapping.cols.status);
    try {
      await svc.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${title}!${statusCol}${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[newStatus]] }
      });
      console.log(`Updated status to ${newStatus} at row ${rowIndex}`);
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  }

  // Update verified_by column if it exists
  if (mapping.cols.verifiedBy !== undefined && verifiedBy > 0) {
    const verifiedByCol = colLetter(mapping.cols.verifiedBy);
    try {
      await svc.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${title}!${verifiedByCol}${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[verifiedBy]] }
      });
      console.log(`Updated verified_by to ${verifiedBy} at row ${rowIndex}`);
    } catch (error) {
      console.error('Failed to update verified_by:', error);
    }
  }

  // Update verified_at column if it exists
  if (mapping.cols.verifiedAt !== undefined) {
    const verifiedAtCol = colLetter(mapping.cols.verifiedAt);
    try {
      await svc.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${title}!${verifiedAtCol}${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[verifiedAt]] }
      });
      console.log(`Updated verified_at to ${verifiedAt} at row ${rowIndex}`);
    } catch (error) {
      console.error('Failed to update verified_at:', error);
    }
  }
}

// Back-compat shim for old code
export async function markCashoutMatched(cashout_id: string, _payerId: number) {
  // now we mark by row instead of id; no-op here (matcher will call markCashoutMatchedByRow)
}

// Load roles from Roles sheet
export async function getRolesFromSheet(): Promise<UserRole[]> {
  const svc = await client();

  try {
    const res = await svc.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Roles!A1:C999',
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
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

    const out: UserRole[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const tgUserId = Number(r[idx.tg_user_id]);
      const role = String(r[idx.role] ?? '').toLowerCase();
      
      if (!tgUserId || isNaN(tgUserId) || !['owner', 'loader'].includes(role)) {
        continue;
      }
      
      out.push({
        tg_user_id: tgUserId,
        role: role as 'owner' | 'loader',
        display_name: String(r[idx.display_name] ?? '')
      });
    }
    return out;
  } catch (_) {
    // ignore (no Roles tab)
    return [];
  }
}

// Mark buy-in as paid with verification details
export async function markBuyinPaid(
  buyinId: string, 
  verifiedBy: number, 
  proofMsgId?: number, 
  proofChatId?: number
): Promise<void> {
  const svc = await client();
  const { title } = await getFirstSheetMeta(svc);

  // Try to find relevant columns
  const head = await svc.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${title}!1:1`,
    valueRenderOption: 'UNFORMATTED_VALUE'
  });
  const headers = (head.data.values?.[0] || []).map(String);
  const hmap = new Map(headers.map((h, i) => [normalizeHeader(h), i]));

  // Find buy-in row by ID
  const res = await svc.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${title}!1:10000`,
    valueRenderOption: 'UNFORMATTED_VALUE'
  });
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
    console.log(`Buy-in ${buyinId} not found in sheet`);
    return;
  }

  // Update status and verification fields
  const updates: Array<{ col: string; value: any }> = [
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
    if (colIdx === undefined) continue; // Skip if column doesn't exist

    const colLetter = (i: number) => {
      let n = i + 1, s = '';
      while (n) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
      return s;
    };
    const col = colLetter(colIdx);

    await svc.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${title}!${col}${buyinRowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[update.value]] }
    });
  }
}
