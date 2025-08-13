import 'dotenv/config';

const required = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
};

// Enhanced validation with client-specific checks
const validateClientConfig = () => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required validations
  if (!process.env.BOT_TOKEN) errors.push('BOT_TOKEN is required');
  if (!process.env.SHEET_ID) errors.push('SHEET_ID is required');
  if (!process.env.GOOGLE_CLIENT_EMAIL) errors.push('GOOGLE_CLIENT_EMAIL is required');
  if (!process.env.GOOGLE_PRIVATE_KEY) errors.push('GOOGLE_PRIVATE_KEY is required');
  
  // Bot token format validation
  if (process.env.BOT_TOKEN && !/^\d+:[A-Za-z0-9_-]+$/.test(process.env.BOT_TOKEN)) {
    errors.push('BOT_TOKEN format is invalid (should be number:alphanumeric)');
  }
  
  // Sheet ID format validation
  if (process.env.SHEET_ID && !/^[A-Za-z0-9_-]+$/.test(process.env.SHEET_ID)) {
    errors.push('SHEET_ID format is invalid');
  }
  
  // Group ID validation
  if (process.env.LOADER_GROUP_ID) {
    const groupId = Number(process.env.LOADER_GROUP_ID);
    if (!Number.isFinite(groupId) || groupId >= 0) {
      warnings.push('LOADER_GROUP_ID should be a negative number for groups');
    }
  } else {
    warnings.push('LOADER_GROUP_ID not set - group workflow disabled');
  }
  
  // Allowed users validation
  if (process.env.ALLOWED_USER_IDS) {
    const userIds = process.env.ALLOWED_USER_IDS.split(',').map(id => Number(id.trim()));
    if (userIds.some(id => !Number.isFinite(id) || id <= 0)) {
      errors.push('ALLOWED_USER_IDS contains invalid user IDs');
    }
    if (userIds.length === 0) {
      warnings.push('ALLOWED_USER_IDS is empty - no users can confirm payments');
    }
  } else {
    warnings.push('ALLOWED_USER_IDS not set - no users can confirm payments');
  }
  
  // Amount limits validation
  const maxAmount = Number(process.env.MAX_BUYIN_AMOUNT || '10000');
  if (maxAmount <= 0 || maxAmount > 100000) {
    warnings.push('MAX_BUYIN_AMOUNT should be between 1 and 100000');
  }
  
  return { errors, warnings };
};

// Validate on startup
const validation = validateClientConfig();
if (validation.errors.length > 0) {
  console.error('❌ Configuration errors:');
  validation.errors.forEach(error => console.error(`  - ${error}`));
  throw new Error('Invalid configuration. Please check environment variables.');
}

if (validation.warnings.length > 0) {
  console.warn('⚠️  Configuration warnings:');
  validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
}

// Required
export const BOT_TOKEN = required('BOT_TOKEN');
export const SHEET_ID  = process.env.SHEET_ID || '';

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

// Amount limits for security
export const MAX_BUYIN_AMOUNT = Number(process.env.MAX_BUYIN_AMOUNT || '10000');
export const MIN_BUYIN_AMOUNT = Number(process.env.MIN_BUYIN_AMOUNT || '20');

// Google Service Account (optional for testing)
export const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || '';
export const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

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

// Rate limiting and performance settings
export const SHEETS_RATE_LIMIT_MS = Number(process.env.SHEETS_RATE_LIMIT_MS || '1000');
export const SESSION_TIMEOUT_MS = Number(process.env.SESSION_TIMEOUT_MS || '300000'); // 5 minutes
export const MAX_MESSAGE_LENGTH = Number(process.env.MAX_MESSAGE_LENGTH || '4096');

// Client identification for multi-tenant logging
export const CLIENT_NAME = process.env.CLIENT_NAME || 'unknown';
export const CLIENT_ID = process.env.CLIENT_ID || 'default';
