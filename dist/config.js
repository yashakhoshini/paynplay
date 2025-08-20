import 'dotenv/config';
const required = (name) => {
    const v = process.env[name];
    if (!v)
        throw new Error(`Missing env var: ${name}`);
    return v;
};
// Enhanced validation with client-specific checks
const validateClientConfig = () => {
    const errors = [];
    const warnings = [];
    // Required validations
    if (!process.env.BOT_TOKEN)
        errors.push('BOT_TOKEN is required');
    // SHEET_ID, GOOGLE_CLIENT_EMAIL, and GOOGLE_PRIVATE_KEY are optional for testing
    // Bot token format validation
    if (process.env.BOT_TOKEN && !/^\d+:[A-Za-z0-9_-]+$/.test(process.env.BOT_TOKEN)) {
        errors.push('BOT_TOKEN format is invalid (should be number:alphanumeric)');
    }
    // Sheet ID format validation (only if provided)
    if (process.env.SHEET_ID && !/^[A-Za-z0-9_-]+$/.test(process.env.SHEET_ID)) {
        errors.push('SHEET_ID format is invalid');
    }
    // Group ID validation
    if (process.env.LOADER_GROUP_ID) {
        const groupId = Number(process.env.LOADER_GROUP_ID);
        if (!Number.isFinite(groupId) || groupId >= 0) {
            warnings.push('LOADER_GROUP_ID should be a negative number for groups');
        }
    }
    else {
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
    }
    else {
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
    // Don't throw error, just log it
    console.error('Bot will continue with limited functionality');
}
if (validation.warnings.length > 0) {
    console.warn('⚠️  Configuration warnings:');
    validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
}
// Required
export const BOT_TOKEN = process.env.BOT_TOKEN || '';
export const SHEET_ID = process.env.SHEET_ID || '';
// Optional (strongly recommended)
export const BASE_URL = process.env.BASE_URL || '';
export const PORT = Number(process.env.PORT || 8080);
// Client-proof defaults (optional)
export const OWNER_TG_USERNAME = process.env.OWNER_TG_USERNAME || ''; // e.g. yashakhoshini
export const METHODS_ENABLED_DEFAULT = (process.env.METHODS_ENABLED_DEFAULT || 'ZELLE,VENMO,CASHAPP,PAYPAL,APPLEPAY')
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
export const ZELLE_HANDLE = process.env.ZELLE_HANDLE || '';
export const VENMO_HANDLE = process.env.VENMO_HANDLE || '';
export const CASHAPP_HANDLE = process.env.CASHAPP_HANDLE || '';
export const PAYPAL_HANDLE = process.env.PAYPAL_HANDLE || '';
// New environment variables for group workflow
export const LOADER_GROUP_ID = process.env.LOADER_GROUP_ID || '';
export const OWNER_IDS = process.env.OWNER_IDS || '';
export const LOADER_IDS = process.env.LOADER_IDS || '';
export const BOT_USERNAME = process.env.BOT_USERNAME || '';
export const PRIVACY_HINTS_ENABLED = process.env.PRIVACY_HINTS_ENABLED !== 'false'; // default true
// Parse allowed user IDs from environment variable
export const ALLOWED_USER_IDS = (process.env.ALLOWED_USER_IDS || '')
    .split(',')
    .map(id => Number(id.trim()))
    .filter(id => Number.isFinite(id) && id > 0);
// Dev bypass for testing (allows single user to approve when no ALLOWED_USER_IDS set)
export const DEV_BYPASS_ID = Number(process.env.DEV_BYPASS_ID || '0');
// Real-club ops multi-tenant configuration
export const METHODS_CIRCLE = (process.env.METHODS_CIRCLE || 'VENMO,ZELLE')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
export const METHODS_EXTERNAL_LINK = (process.env.METHODS_EXTERNAL_LINK || 'CARD,CASHAPP,APPLEPAY')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
export const STRIPE_CHECKOUT_URL = process.env.STRIPE_CHECKOUT_URL || '';
export const WITHDRAW_STALE_HOURS = Number(process.env.WITHDRAW_STALE_HOURS || '24');
export const FIXED_WALLETS_JSON = process.env.FIXED_WALLETS_JSON || '{}';
// Example JSON:
// {"PAYPAL":"ConnorRobinson794","BTC":"bc1...","ETH":"0x2f26...","LTC":"ltc1...",
//  "USDT_ERC20":"0x2f26...","USDT_TRC20":"TCA6...","XRP":"rNohT...","SOL":"Djw27..."}
export const FIXED_WALLETS = (() => {
    try {
        return JSON.parse(FIXED_WALLETS_JSON);
    }
    catch {
        return {};
    }
})();
// Owner payment method addresses for owner-paid rails
export const APPLE_PAY_HANDLE = process.env.APPLE_PAY_HANDLE || '';
export const PAYPAL_EMAIL = process.env.PAYPAL_EMAIL || '';
export const CRYPTO_WALLET_BTC = process.env.CRYPTO_WALLET_BTC || '';
export const CRYPTO_WALLET_ETH = process.env.CRYPTO_WALLET_ETH || '';
export const CRYPTO_WALLET = process.env.CRYPTO_WALLET || '';
export const CRYPTO_NETWORKS = (process.env.CRYPTO_NETWORKS || 'BTC,ETH')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
// Parse numeric IDs for owners and loaders
export const OWNER_IDS_ARRAY = (process.env.OWNER_IDS || '')
    .split(',')
    .map(id => Number(id.trim()))
    .filter(id => Number.isFinite(id) && id > 0);
export const LOADER_IDS_ARRAY = (process.env.LOADER_IDS || '')
    .split(',')
    .map(id => Number(id.trim()))
    .filter(id => Number.isFinite(id) && id > 0);
// Enhanced authorization helper with dev bypass
const rawAllowed = (process.env.ALLOWED_USER_IDS || process.env.ALLOWED_LOADERS || '')
    .split(',').map(s => s.trim()).filter(Boolean).map(Number);
const EFFECTIVE_ALLOWED = rawAllowed.length ? rawAllowed : (DEV_BYPASS_ID ? [DEV_BYPASS_ID] : []);
export function isAuthorized(userId) {
    return EFFECTIVE_ALLOWED.includes(userId);
}
// Effective allowed users (includes dev bypass if no users configured)
export const EFFECTIVE_ALLOWED_USER_IDS = ALLOWED_USER_IDS.length > 0
    ? ALLOWED_USER_IDS
    : (DEV_BYPASS_ID > 0 ? [DEV_BYPASS_ID] : []);
// Rate limiting and performance settings
export const SHEETS_RATE_LIMIT_MS = Number(process.env.SHEETS_RATE_LIMIT_MS || '1000');
export const SESSION_TIMEOUT_MS = Number(process.env.SESSION_TIMEOUT_MS || '300000'); // 5 minutes
export const MAX_MESSAGE_LENGTH = Number(process.env.MAX_MESSAGE_LENGTH || '4096');
// Client identification for multi-tenant logging
export const CLIENT_NAME = process.env.CLIENT_NAME || 'unknown';
export const CLIENT_ID = process.env.CLIENT_ID || 'default';
