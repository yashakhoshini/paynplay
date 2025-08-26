import 'dotenv/config';
function decodePrivateKey() {
    const b64 = process.env.GOOGLE_PRIVATE_KEY_B64 || '';
    const raw = process.env.GOOGLE_PRIVATE_KEY || '';
    if (b64) {
        try {
            const decoded = Buffer.from(b64, 'base64').toString('utf8').trim();
            return decoded;
        }
        catch (e) {
            throw new Error('GOOGLE_PRIVATE_KEY_B64 could not be base64-decoded.');
        }
    }
    // Fallback for legacy \n style (not used in CI ideally)
    if (raw) {
        return raw
            .replace(/\\r\\n/g, '\n')
            .replace(/\\n/g, '\n')
            .replace(/\r\n/g, '\n')
            .trim();
    }
    return '';
}
export const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL ?? '';
export const GOOGLE_PRIVATE_KEY_PEM = decodePrivateKey();
// Sanity checks that don't leak the key
(function sanityCheck() {
    if (!GOOGLE_CLIENT_EMAIL) {
        throw new Error('GOOGLE_CLIENT_EMAIL is missing');
    }
    if (!GOOGLE_PRIVATE_KEY_PEM) {
        throw new Error('Private key missing: set GOOGLE_PRIVATE_KEY_B64 (preferred) or GOOGLE_PRIVATE_KEY');
    }
    const first = GOOGLE_PRIVATE_KEY_PEM.split('\n')[0]?.trim();
    const last = GOOGLE_PRIVATE_KEY_PEM.split('\n').slice(-1)[0]?.trim();
    if (first !== '-----BEGIN PRIVATE KEY-----' || last !== '-----END PRIVATE KEY-----') {
        throw new Error('Private key appears malformed (BEGIN/END lines not found exactly).');
    }
})();
// Bot Configuration
export const BOT_TOKEN = process.env.BOT_TOKEN || '';
export const CLIENT_NAME = process.env.CLIENT_NAME || 'Club';
export const CLIENT_ID = process.env.CLIENT_ID || 'default';
// Payment Methods
export const METHODS_ENABLED_DEFAULT = (process.env.METHODS_ENABLED_DEFAULT || 'VENMO,ZELLE,PAYPAL,CASHAPP,APPLE PAY,CRYPTO,CARD')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
export const METHODS_CIRCLE = (process.env.METHODS_CIRCLE || 'VENMO,ZELLE,CASHAPP')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
export const METHODS_EXTERNAL_LINK = (process.env.METHODS_EXTERNAL_LINK || 'PAYPAL,APPLE PAY,CRYPTO,CARD')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
// Club Settings
export const MIN_BUYIN_AMOUNT = Number(process.env.MIN_BUYIN_AMOUNT) || 20;
export const MAX_BUYIN_AMOUNT = Number(process.env.MAX_BUYIN_AMOUNT) || 2000;
export const OWNER_FALLBACK_THRESHOLD = Number(process.env.OWNER_FALLBACK_THRESHOLD) || 300;
export const WITHDRAW_STALE_HOURS = Number(process.env.WITHDRAW_STALE_HOURS) || 24;
// Owner Information
export const OWNER_TG_USERNAME = process.env.OWNER_TG_USERNAME || '';
export const LOADER_GROUP_ID = process.env.LOADER_GROUP_ID || '';
export const ALLOWED_USER_IDS = (process.env.ALLOWED_USER_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
// Google Sheets Configuration
export const SHEET_ID = process.env.SHEET_ID || '';
export const SHEETS_RATE_LIMIT_MS = Number(process.env.SHEETS_RATE_LIMIT_MS) || 1000;
// Payment Handles
export const ZELLE_HANDLE = process.env.ZELLE_HANDLE || '';
export const VENMO_HANDLE = process.env.VENMO_HANDLE || '';
export const CASHAPP_HANDLE = process.env.CASHAPP_HANDLE || '';
export const PAYPAL_HANDLE = process.env.PAYPAL_HANDLE || '';
export const APPLE_PAY_HANDLE = process.env.APPLE_PAY_HANDLE || '';
export const PAYPAL_EMAIL = process.env.PAYPAL_EMAIL || '';
export const CRYPTO_WALLET_BTC = process.env.CRYPTO_WALLET_BTC || '';
export const CRYPTO_WALLET_ETH = process.env.CRYPTO_WALLET_ETH || '';
export const CRYPTO_WALLET = process.env.CRYPTO_WALLET || '';
export const CRYPTO_NETWORKS = process.env.CRYPTO_NETWORKS || 'BTC,ETH';
// External Services
export const STRIPE_CHECKOUT_URL = process.env.STRIPE_CHECKOUT_URL || '';
// Bot Configuration
export const BASE_URL = process.env.BASE_URL || '';
export const PORT = Number(process.env.PORT) || 3000;
export const BOT_USERNAME = process.env.BOT_USERNAME || '';
export const PRIVACY_HINTS_ENABLED = process.env.PRIVACY_HINTS_ENABLED === 'true';
export const SESSION_TIMEOUT_MS = Number(process.env.SESSION_TIMEOUT_MS) || 300000;
export const MAX_MESSAGE_LENGTH = Number(process.env.MAX_MESSAGE_LENGTH) || 4096;
// Defaults
export const DEFAULT_CURRENCY = 'USD';
export const DEFAULT_FAST_FEE = 0.05;
// Enhanced validation with client-specific checks
const validateClientConfig = () => {
    const errors = [];
    const warnings = [];
    // Validate required fields
    if (!BOT_TOKEN) {
        errors.push('BOT_TOKEN is required');
    }
    else if (!/^\d+:[A-Za-z0-9_-]+$/.test(BOT_TOKEN)) {
        errors.push('BOT_TOKEN format is invalid (should be number:alphanumeric)');
    }
    if (!SHEET_ID) {
        errors.push('SHEET_ID is required');
    }
    if (!GOOGLE_CLIENT_EMAIL) {
        errors.push('GOOGLE_CLIENT_EMAIL is required');
    }
    if (!GOOGLE_PRIVATE_KEY_PEM) {
        errors.push('GOOGLE_PRIVATE_KEY_PEM is required');
    }
    // Validate group ID format
    const groupId = Number(LOADER_GROUP_ID);
    if (!Number.isFinite(groupId) || groupId >= 0) {
        warnings.push('LOADER_GROUP_ID should be a negative number for groups');
    }
    // Validate allowed user IDs
    if (ALLOWED_USER_IDS.length === 0) {
        warnings.push('ALLOWED_USER_IDS is empty - bot will be restricted');
    }
    // Validate payment methods
    const missingHandles = METHODS_EXTERNAL_LINK.filter(method => {
        switch (method) {
            case 'APPLE PAY': return !APPLE_PAY_HANDLE;
            case 'CRYPTO': return !CRYPTO_WALLET;
            case 'CARD': return !STRIPE_CHECKOUT_URL;
            default: return false;
        }
    });
    if (missingHandles.length > 0) {
        warnings.push(`Missing payment handles for: ${missingHandles.join(', ')}`);
    }
    return { errors, warnings };
};
// Run validation
const { errors, warnings } = validateClientConfig();
if (errors.length > 0) {
    console.error('❌ Configuration errors:');
    errors.forEach(error => console.error(`  - ${error}`));
    if (errors.some(e => e.includes('BOT_TOKEN'))) {
        console.log('Bot will continue with limited functionality');
    }
    else {
        throw new Error('Critical configuration errors found');
    }
}
if (warnings.length > 0) {
    console.log('⚠️  Configuration warnings:');
    warnings.forEach(warning => console.log(`  - ${warning}`));
}
// Export validation results for testing
export const CONFIG_VALIDATION = { errors, warnings };
// Legacy exports for backward compatibility
export const EFFECTIVE_ALLOWED_USER_IDS = ALLOWED_USER_IDS;
export const FIXED_WALLETS = {
    VENMO: VENMO_HANDLE,
    ZELLE: ZELLE_HANDLE,
    CASHAPP: CASHAPP_HANDLE,
    PAYPAL: PAYPAL_HANDLE,
    BTC: CRYPTO_WALLET_BTC,
    ETH: CRYPTO_WALLET_ETH,
    LTC: CRYPTO_WALLET,
    USDT_ERC20: CRYPTO_WALLET,
    USDT_TRC20: CRYPTO_WALLET,
    XRP: CRYPTO_WALLET,
    SOL: CRYPTO_WALLET
};
