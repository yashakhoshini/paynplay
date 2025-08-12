import { google } from "googleapis";
import { GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, SHEET_ID } from "./config.js";
import type { Settings, OwnerAccount, CashoutRow, BuyinRow, Method } from "./types.js";

const auth = new google.auth.JWT({
  email: GOOGLE_CLIENT_EMAIL,
  key: GOOGLE_PRIVATE_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

const A1 = {
  Settings: "Settings!A1:B999",
  OwnerAccounts: "OwnerAccounts!A1:D999",
  Cashouts: "Cashouts!A1:M999",
  Buyins: "Buyins!A1:I999",
};

export async function getSettings(): Promise<Settings> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: A1.Settings });
  const rows = res.data.values || [];
  const obj: Record<string, string> = {};
  for (const [k, v] of rows.slice(1)) obj[k] = v;
  const METHODS_ENABLED = (obj["METHODS_ENABLED"] || "").split(",").map(s => s.trim()).filter(Boolean) as Method[];
  return {
    CLUB_NAME: obj["CLUB_NAME"] || "Club",
    METHODS_ENABLED,
    CURRENCY: obj["CURRENCY"] || "USD",
    FAST_FEE_PCT: parseFloat(obj["FAST_FEE_PCT"] || "0"),
    OWNER_FALLBACK_THRESHOLD: parseFloat(obj["OWNER_FALLBACK_THRESHOLD"] || "999999"),
    OWNER_TG_USERNAME: obj["OWNER_TG_USERNAME"],
  };
}

export async function getOwnerAccounts(): Promise<OwnerAccount[]> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: A1.OwnerAccounts });
  const rows = res.data.values || [];
  const headers = rows[0] || [];
  const idx = (name: string) => headers.indexOf(name);
  return rows.slice(1).filter(r => r.length).map(r => ({
    method: r[idx("method")] as any,
    handle: r[idx("handle")],
    display_name: r[idx("display_name")],
    instructions: r[idx("instructions")],
  }));
}

export async function appendBuyin(b: BuyinRow) {
  const values = [[
    b.buyin_id, b.tg_user_id, b.display_name, b.method, b.amount,
    b.status, b.assigned_to, b.created_at, b.updated_at
  ]];
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Buyins!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values }
  });
}

export async function listPendingCashouts(method: Method): Promise<CashoutRow[]> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: A1.Cashouts });
  const rows = res.data.values || [];
  const headers = rows[0] || [];
  const idx = (name: string) => headers.indexOf(name);
  const toRow = (r: string[]): CashoutRow => ({
    cashout_id: r[idx("cashout_id")],
    tg_user_id: r[idx("tg_user_id")],
    display_name: r[idx("display_name")],
    method: r[idx("method")] as any,
    amount: parseFloat(r[idx("amount")]),
    priority_type: (r[idx("priority_type")] as any) || "NORMAL",
    status: (r[idx("status")] as any) || "PENDING",
    requested_at: r[idx("requested_at")] || "",
    matched_at: r[idx("matched_at")] || "",
    payer_tg_user_id: r[idx("payer_tg_user_id")] || "",
    payer_handle: r[idx("payer_handle")] || "",
    receiver_handle: (idx("receiver_handle")>=0? r[idx("receiver_handle")] : "" ) || "",
    notes: r[idx("notes")] || ""
  });
  return rows.slice(1)
    .filter(r => r.length && r[idx("status")] === "PENDING" && r[idx("method")] === method)
    .map(toRow);
}

export async function markCashoutMatched(cashout_id: string, payer_tg_user_id: string | number) {
  // naive implementation: read all, find row, update columns "status","matched_at","payer_tg_user_id"
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: A1.Cashouts });
  const rows = res.data.values || [];
  const headers = rows[0] || [];
  const idx = (name: string) => headers.indexOf(name);
  const i = rows.findIndex(r => r[idx("cashout_id")] === cashout_id);
  if (i < 0) return;
  rows[i][idx("status")] = "MATCHED";
  rows[i][idx("matched_at")] = new Date().toISOString();
  rows[i][idx("payer_tg_user_id")] = String(payer_tg_user_id);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Cashouts!A${i+1}:M${i+1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [rows[i]] }
  });
}
