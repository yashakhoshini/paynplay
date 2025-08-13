import 'dotenv/config';

const required = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
};

// Required
export const BOT_TOKEN = required('BOT_TOKEN');
export const SHEET_ID  = required('SHEET_ID');

// Optional (strongly recommended)
export const BASE_URL  = process.env.BASE_URL || '';
export const PORT      = Number(process.env.PORT || 8080);

// Client-proof defaults (optional)
export const OWNER_TG_USERNAME = process.env.OWNER_TG_USERNAME || ''; // e.g. yashakhoshini
export const DEFAULT_METHODS = (process.env.METHODS_ENABLED_DEFAULT || 'ZELLE,VENMO,CASHAPP,PAYPAL')
  .split(',')
  .map(s => s.trim().toUpperCase())
  .filter(Boolean)
  .filter(method => method !== 'CASH'); // Explicitly exclude CASH

export const DEFAULT_CURRENCY = process.env.CURRENCY_DEFAULT || 'USD';
export const DEFAULT_FAST_FEE = Number(process.env.FAST_FEE_PCT_DEFAULT || '0.02');
export const OWNER_FALLBACK_THRESHOLD = Number(process.env.OWNER_FALLBACK_THRESHOLD || '100');

// Google Service Account (required for Sheets access)
export const GOOGLE_CLIENT_EMAIL = required('GOOGLE_CLIENT_EMAIL');
export const GOOGLE_PRIVATE_KEY = required('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n');

// Optional owner handles (used if no OwnerAccounts sheet)
export const ZELLE_HANDLE   = process.env.ZELLE_HANDLE   || '';
export const VENMO_HANDLE   = process.env.VENMO_HANDLE   || '';
export const CASHAPP_HANDLE = process.env.CASHAPP_HANDLE || '';
export const PAYPAL_HANDLE  = process.env.PAYPAL_HANDLE  || '';

// New environment variables for group workflow
export const LOADER_GROUP_ID = process.env.LOADER_GROUP_ID || '';
export const OWNER_IDS = process.env.OWNER_IDS || '';
export const LOADER_IDS = process.env.LOADER_IDS || '';
export const BOT_USERNAME = process.env.BOT_USERNAME || '';
export const PRIVACY_HINTS_ENABLED = process.env.PRIVACY_HINTS_ENABLED !== 'false'; // default true

// Parse allowed user IDs from environment variable
export const ALLOWED_USER_IDS: number[] = (process.env.ALLOWED_USER_IDS || '')
  .split(',')
  .map(id => Number(id.trim()))
  .filter(id => Number.isFinite(id) && id > 0);
