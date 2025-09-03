import { Bot, session, InlineKeyboard, Context } from "grammy";
import express from "express";
import { webhookCallback } from "grammy";
import { 
  BOT_TOKEN, 
  BASE_URL, 
  PORT,
  BOT_USERNAME,
  PRIVACY_HINTS_ENABLED,
  ALLOWED_USER_IDS,
  EFFECTIVE_ALLOWED_USER_IDS,
  MAX_BUYIN_AMOUNT,
  MIN_BUYIN_AMOUNT,
  SESSION_TIMEOUT_MS,
  MAX_MESSAGE_LENGTH,
  CLIENT_NAME,
  CLIENT_ID,
  ZELLE_HANDLE,
  VENMO_HANDLE,
  CASHAPP_HANDLE,
  PAYPAL_HANDLE,
  METHODS_CIRCLE,
  METHODS_EXTERNAL_LINK,
  STRIPE_CHECKOUT_URL,
  WITHDRAW_STALE_HOURS,
  FIXED_WALLETS,
  METHODS_ENABLED_DEFAULT,
  DEFAULT_CURRENCY,
  DEFAULT_FAST_FEE,
  OWNER_FALLBACK_THRESHOLD,
  OWNER_TG_USERNAME
} from "./config.js";
import { MSG } from "./messages.js";
import { 
  getSettings, 
  getOwnerAccounts, 
  appendWithdrawalCircle,
  appendWithdrawalOwner,
  appendOwnerPayout,
  updateWithdrawalStatusById,
  appendExternalDeposit,
  markOwnerPayoutPaid,
  markStaleCashAppCircleWithdrawals,
  appendWithdrawalRequest,
  setWithdrawalStatus,
  requeueExpiredMatched,
  appendDeposit,
  getOpenWithdrawalsByMethod,
  matchDepositToWithdrawal
} from "./sheets.js";
import { findMatch } from "./matcher.js";
import { Transaction, GroupSession } from "./types.js";
import { SecurityValidator, logSecurityEvent } from "./security.js";

type SessionData = {
  step?: "METHOD" | "AMOUNT" | "WITHDRAW_METHOD" | "WITHDRAW_AMOUNT" | "WITHDRAW_TAG" | "WITHDRAW_CHANNEL" | "CRYPTO_COIN" | "CRYPTO_ADDRESS" | "EXTERNAL_AMOUNT" | "EXTERNAL_REFERENCE";
  method?: string;
  amount?: number;
  tag?: string;
  requestTimestampISO?: string;
  lastActivity?: number; // For session timeout
  payoutType?: 'CIRCLE' | 'OWNER';
  channel?: string; // PAYPAL, BTC, ETH, etc.
  cryptoCoin?: string; // For crypto withdrawals
  cryptoAddress?: string; // For crypto withdrawals
  externalAmount?: number; // For external deposits
  externalReference?: string; // For external deposits
};

interface MyContext extends Context {
  session: SessionData;
}

// ----- LOADER AUTH & GROUP --------------------------------------------------
const AUTHORIZED_LOADER_IDS: Set<number> = (() => {
  const raw = process.env.LOADER_IDS || process.env.LOADER_ID || '';
  return new Set(raw.split(',').map(s=>Number(String(s).trim())).filter(n=>Number.isFinite(n)));
})();
function isAuthorizedLoader(uid?: number){ return process.env.SKIP_ENFORCEMENT==='true' ? true : !!uid && AUTHORIZED_LOADER_IDS.has(uid); }
function parseGroupIdFromEnv(){
  const raw = process.env.LOADER_GROUP_ID || '';
  const parts = raw.split(',').map(s=>s.trim()).filter(Boolean);
  for (const p of parts){ const n = Number(p); if (Number.isFinite(n)) return n; } return NaN;
}
const LOADER_GROUP_ID = parseGroupIdFromEnv();

// ----- CONTACT FALLBACK -----------------------------------------------------
const CONTACT_OWNER = process.env.OWNER_HANDLE || '@owner';
const CONTACT_LOADERS = process.env.LOADER_HANDLES || '@loader1';
const MSG_FALLBACK = `If anything goes wrong, message ${CONTACT_OWNER} or ${CONTACT_LOADERS} with a short description.`;

function initial(): SessionData {
  return { lastActivity: Date.now() };
}

// Store active transactions and group sessions
const activeTransactions = new Map<string, Transaction>();
const groupSessions = new Map<number, GroupSession>();

// Cache for Google Sheets data to improve performance
interface CachedData {
  settings: any;
  owners: any[];
  lastUpdated: number;
}

const sheetsCache: CachedData = {
  settings: null,
  owners: [],
  lastUpdated: 0
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

// Get cached settings or fetch from sheets
async function getCachedSettings() {
  const startTime = Date.now();
  const now = Date.now();
  
  if (sheetsCache.settings && (now - sheetsCache.lastUpdated) < CACHE_TTL) {
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Settings served from cache (${Date.now() - startTime}ms)`);
    return sheetsCache.settings;
  }
  
  try {
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Fetching settings from Google Sheets...`);
    const settings = await getSettings();
    sheetsCache.settings = settings;
    sheetsCache.lastUpdated = now;
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Settings fetched from sheets (${Date.now() - startTime}ms)`);
    return settings;
  } catch (error) {
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Google Sheets not configured, using defaults`);
    // Use default settings when Google Sheets is not configured
    const defaultSettings = {
      CLUB_NAME: 'Club',
      METHODS_ENABLED: METHODS_ENABLED_DEFAULT,
      CURRENCY: DEFAULT_CURRENCY,
      FAST_FEE_PCT: DEFAULT_FAST_FEE,
      OWNER_FALLBACK_THRESHOLD: OWNER_FALLBACK_THRESHOLD,
      OWNER_TG_USERNAME: OWNER_TG_USERNAME
    };
    sheetsCache.settings = defaultSettings;
    sheetsCache.lastUpdated = now;
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Settings served from defaults (${Date.now() - startTime}ms)`);
    return defaultSettings;
  }
}

// Get cached owner accounts or fetch from sheets
async function getCachedOwnerAccounts() {
  const startTime = Date.now();
  const now = Date.now();
  
  if (sheetsCache.owners.length > 0 && (now - sheetsCache.lastUpdated) < CACHE_TTL) {
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Owner accounts served from cache (${Date.now() - startTime}ms)`);
    return sheetsCache.owners;
  }
  
  try {
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Fetching owner accounts from Google Sheets...`);
    const owners = await getOwnerAccounts();
    sheetsCache.owners = owners;
    sheetsCache.lastUpdated = now;
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Owner accounts fetched from sheets (${Date.now() - startTime}ms)`);
    return owners;
  } catch (error) {
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Google Sheets not configured, using fallback owner accounts`);
    // Use fallback owner accounts when Google Sheets is not configured
    const fallbackOwners = [];
    
    // Only add methods that have handles configured
    if (VENMO_HANDLE) {
      fallbackOwners.push({ method: 'VENMO', handle: VENMO_HANDLE, display_name: 'Owner', instructions: 'Include note with payment' });
    }
    if (ZELLE_HANDLE) {
      fallbackOwners.push({ method: 'ZELLE', handle: ZELLE_HANDLE, display_name: 'Owner', instructions: 'Include note with payment' });
    }
    if (CASHAPP_HANDLE) {
      fallbackOwners.push({ method: 'CASHAPP', handle: CASHAPP_HANDLE, display_name: 'Owner', instructions: 'Include note with payment' });
    }
    if (PAYPAL_HANDLE) {
      fallbackOwners.push({ method: 'PAYPAL', handle: PAYPAL_HANDLE, display_name: 'Owner', instructions: 'Include note with payment' });
    }
    
    sheetsCache.owners = fallbackOwners;
    sheetsCache.lastUpdated = now;
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Owner accounts served from fallbacks (${Date.now() - startTime}ms) - Found ${fallbackOwners.length} methods`);
    return fallbackOwners;
  }
}

// Invalidate cache when data changes
function invalidateCache() {
  sheetsCache.settings = null;
  sheetsCache.owners = [];
  sheetsCache.lastUpdated = 0;
}

// Session cleanup timer
setInterval(() => {
  const now = Date.now();
  const timeoutThreshold = now - SESSION_TIMEOUT_MS;
  
  // Clean up expired transactions
  for (const [buyinId, transaction] of activeTransactions.entries()) {
    if (transaction.timestamp < timeoutThreshold) {
      activeTransactions.delete(buyinId);
      logSecurityEvent('EXPIRED_TRANSACTION_CLEANUP', transaction.playerId, buyinId);
    }
  }
  
  // Clean up expired group sessions
  for (const [chatId, session] of groupSessions.entries()) {
    // Group sessions don't have timestamps, so we'll keep them for now
    // In a production system, you might want to add timestamps
  }
  
  console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Session cleanup completed. Active transactions: ${activeTransactions.size}`);
}, 60000); // Check every minute

// Cache refresh timer (refresh every 5 minutes)
setInterval(async () => {
  try {
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Refreshing cache...`);
    await getCachedSettings();
    await getCachedOwnerAccounts();
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Cache refresh completed`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Cache refresh failed:`, error);
  }
}, CACHE_TTL); // Refresh every 5 minutes

// Stale sweeper timer (every 10 minutes)
setInterval(async () => {
  try {
    await markStaleCashAppCircleWithdrawals(WITHDRAW_STALE_HOURS);
  } catch (e) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Stale sweep failed:`, e);
  }
}, 10 * 60 * 1000); // Every 10 minutes

// Generate unique buy-in ID
function generateBuyinId(): string {
  return `B-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Get or create group session
function getGroupSession(chatId: number): GroupSession {
  if (!groupSessions.has(chatId)) {
    groupSessions.set(chatId, { firstTimeUsers: new Set() });
  }
  return groupSessions.get(chatId)!;
}

// Use the secure validation from SecurityValidator
function validateAmount(amount: number): { valid: boolean; error?: string } {
  const result = SecurityValidator.validateAmount(amount);
  return { valid: result.valid, error: result.error };
}

// Truncate message if too long
function truncateMessage(message: string, maxLength: number = MAX_MESSAGE_LENGTH): string {
  if (message.length <= maxLength) return message;
  return message.substring(0, maxLength - 3) + '...';
}

// Enhanced authorization check
function isAuthorized(userId: number): boolean {
  if (!EFFECTIVE_ALLOWED_USER_IDS || EFFECTIVE_ALLOWED_USER_IDS.length === 0) {
    console.warn(`[${new Date().toISOString()}] [${CLIENT_NAME}] No authorized users configured`);
    return false;
  }
  const isAllowed = EFFECTIVE_ALLOWED_USER_IDS.includes(String(userId));
  if (!isAllowed) {
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Denied access: user ${userId} not in allowed list ${EFFECTIVE_ALLOWED_USER_IDS.join(',')}`);
  }
  return isAllowed;
}

// Initialize bot function
function initializeBot() {
  // Validate bot token before creating bot instance
  if (!BOT_TOKEN) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] ❌ CRITICAL ERROR: BOT_TOKEN is missing!`);
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Please set the BOT_TOKEN environment variable.`);
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Bot will not start without a valid token.`);
    throw new Error('BOT_TOKEN is required');
  }

  if (!/^\d+:[A-Za-z0-9_-]+$/.test(BOT_TOKEN)) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] ❌ CRITICAL ERROR: BOT_TOKEN format is invalid!`);
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Token should be in format: number:alphanumeric`);
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Current token: ${BOT_TOKEN}`);
    throw new Error('BOT_TOKEN format is invalid');
  }

  console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] ✓ Bot token validated successfully`);
  return new Bot<MyContext>(BOT_TOKEN);
}

const bot = initializeBot();

// Global callback query ack middleware: respond immediately to stop Telegram spinner
bot.use(async (ctx, next) => {
  if (ctx.callbackQuery) {
    try {
      await ctx.answerCallbackQuery();
    } catch (e) {
      // ignore
    }
  }
  await next();
});

// Helper to parse LOADER_GROUP_ID env var (comma-separated)
function getLoaderGroupId(): number | null {
  const raw = String(LOADER_GROUP_ID || process.env.LOADER_GROUP_ID || '').trim();
  if (!raw) return null;
  const parts = raw.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
  // Prefer negative group chat id; fall back to first numeric entry
  const chosen = parts.find(n => n < 0) ?? parts[0];
  return Number.isFinite(chosen) ? chosen : null;
}

// Add session middleware with timeout
bot.use(session({ 
  initial,
  getSessionKey: (ctx) => {
    // Use user ID for private chats, chat ID for groups
    return ctx.chat?.type === 'private' ? `user:${ctx.from?.id}` : `chat:${ctx.chat?.id}`;
  }
}));

// Update session activity on each interaction
bot.use(async (ctx, next) => {
  if (ctx.session) {
    ctx.session.lastActivity = Date.now();
  }
  await next();
});

// Global error handler
bot.catch((err) => {
  console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Bot error:`, err);
});

// Debug logging for all updates
bot.on('message', async (ctx: MyContext, next: () => Promise<void>) => {
  console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Received message:`, {
    from: (ctx as any).from?.id,
    text: (ctx as any).message?.text,
    chatType: (ctx as any).chat?.type
  });
  await next(); // Let commands and other handlers run
});

// /ping for quick health check
bot.command("ping", async (ctx: MyContext) => {
  try {
    const userId = (ctx as any).from?.id || 'unknown';
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Ping command received from user ${userId}`);
    await ctx.reply("pong ✅");
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Ping response sent successfully`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Ping failed:`, error);
  }
});

// /help handler - provides guidance before /start
bot.command("help", async (ctx: MyContext) => {
  try {
    const helpText = `🎰 Pay-n-Play Bot Help

How to use this bot:

1️⃣ Start a buy-in: Type /start to begin the payment process
2️⃣ Choose payment method: Select from available options (Zelle, Venmo, etc.)
3️⃣ Enter amount: Specify how much you want to buy in ($${MIN_BUYIN_AMOUNT}-$${MAX_BUYIN_AMOUNT})
4️⃣ Get payment instructions: The bot will tell you who to pay and how
5️⃣ Send screenshot: Post your payment proof in the group chat

Commands:
• /start - Begin a new buy-in or withdrawal
• /withdraw - Start a withdrawal request
• /help - Show this help message

Need help? Contact @Cardinal_J1 @Preshmiles @calmcrafter101`;
    
    await ctx.reply(truncateMessage(helpText));
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Help command failed:`, error);
    await ctx.reply("Sorry, something went wrong. Please try again.");
  }
});

// /withdraw command
bot.command("withdraw", async (ctx: MyContext) => {
  try {
    await startWithdrawFlow(ctx);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Withdraw command failed:`, error);
    await ctx.reply("Sorry, something went wrong. Please try again.");
  }
});

// /start handler
bot.command("start", async (ctx: MyContext) => {
  try {
    const userId = (ctx as any).from?.id || 'unknown';
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Start command received from user ${userId}`);
    
    let settings;
    try {
      settings = await getCachedSettings();
    } catch (error) {
      console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Google Sheets not configured, using defaults`);
      // Use default settings when Google Sheets is not configured
      settings = {
        CLUB_NAME: 'Club',
        METHODS_ENABLED: METHODS_ENABLED_DEFAULT,
        CURRENCY: DEFAULT_CURRENCY,
        FAST_FEE_PCT: DEFAULT_FAST_FEE,
        OWNER_FALLBACK_THRESHOLD: OWNER_FALLBACK_THRESHOLD,
        OWNER_TG_USERNAME: OWNER_TG_USERNAME
      };
    }
    
    const kb = new InlineKeyboard()
      .text("💵 Buy-In", "BUYIN")
      .row()
      .text("💸 Withdraw", "WITHDRAW");
    
    await ctx.reply(truncateMessage(MSG.welcome(settings.CLUB_NAME ?? "our club")), {
      reply_markup: kb,
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Start command failed:`, error);
    await ctx.reply("Sorry, something went wrong. Please try again.");
  }
});

// Buy-in start
bot.callbackQuery("BUYIN", async (ctx: MyContext) => {
  try {
    await ctx.answerCallbackQuery().catch(() => {});
    let settings;
    let owners: any[] = [];
    
    try {
      settings = await getCachedSettings();
      owners = await getCachedOwnerAccounts();
    } catch (error) {
      console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Google Sheets not configured, using defaults`);
      // Use default settings when Google Sheets is not configured
      settings = {
        CLUB_NAME: 'Club',
        METHODS_ENABLED: METHODS_ENABLED_DEFAULT,
        CURRENCY: DEFAULT_CURRENCY,
        FAST_FEE_PCT: DEFAULT_FAST_FEE,
        OWNER_FALLBACK_THRESHOLD: OWNER_FALLBACK_THRESHOLD,
        OWNER_TG_USERNAME: OWNER_TG_USERNAME
      };
      owners = [];
    }
    
    // Get available methods from both pending withdrawals and owner accounts
    const availableMethods = new Set<string>();
    
    // Add methods from pending withdrawals
    for (const m of settings.METHODS_ENABLED) {
      availableMethods.add(m);
    }
    
    // Add methods from owner accounts
    for (const owner of owners) {
      availableMethods.add(owner.method);
    }
    
    ctx.session.step = "METHOD";
    const kb = new InlineKeyboard();
    
    // Convert Set to Array and sort for consistent ordering
    const sortedMethods = Array.from(availableMethods).sort();
    
    // Check if any methods are available
    if (sortedMethods.length === 0) {
      await ctx.editMessageText("No payment methods are currently available. Please contact the owner to set up payment methods or wait for pending withdrawals.");
      return;
    }
    
    for (const m of sortedMethods) {
      kb.text(m, `METHOD_${m}`).row();
    }
    
    await ctx.editMessageText(MSG.selectMethod, { reply_markup: kb });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Buy-in callback failed:`, error);
    await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
  }
});

// Method chosen
bot.callbackQuery(/METHOD_(.+)/, async (ctx: MyContext) => {
  try {
    await ctx.answerCallbackQuery().catch(() => {});
    const method = ctx.match?.[1];
    if (!method) return;
    
    const upper = method.toUpperCase();
    
    // Get settings to check method types
    let settings;
    try {
      settings = await getCachedSettings();
    } catch (error) {
      console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to get settings, using env defaults`);
      settings = {
        METHODS_EXTERNAL_LINK: METHODS_EXTERNAL_LINK,
        STRIPE_CHECKOUT_URL: STRIPE_CHECKOUT_URL
      };
    }
    
    // Check if this is an external link method
    if (settings.METHODS_EXTERNAL_LINK.includes(upper) && settings.STRIPE_CHECKOUT_URL) {
      const kb = new InlineKeyboard()
        .url('🔗 Pay via Stripe', settings.STRIPE_CHECKOUT_URL)
        .row()
        .text('🧾 Log Payment After Stripe', 'EXTERNAL_DEPOSIT_LOG');
      await ctx.editMessageText(`Click the link to pay via ${method}. After payment, click the button below to log it for records:`, { reply_markup: kb });
      return;
    }
    
    // For circle methods, proceed with normal flow
    ctx.session.method = method;
    ctx.session.step = "AMOUNT";

    const kb = new InlineKeyboard()
      .text("$25", "AMT_25")
      .text("$50", "AMT_50")
      .row()
      .text("$75", "AMT_75")
      .text("$100", "AMT_100")
      .row()
      .text("$200", "AMT_200")
      .text("Custom", "AMT_CUSTOM");

    await ctx.editMessageText(MSG.enterAmount, { reply_markup: kb });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Method selection failed:`, error);
    await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
  }
});

// Pre-set amounts
bot.callbackQuery(/AMT_(\d+)/, async (ctx: MyContext) => {
  try {
    // Rate limiting check
    const rateLimit = SecurityValidator.checkRateLimit(ctx.from?.id || 0);
    if (!rateLimit.allowed) {
      await ctx.answerCallbackQuery({ 
        text: `Rate limit exceeded. Please wait ${Math.ceil((rateLimit.resetTime! - Date.now()) / 1000)} seconds.`, 
        show_alert: true 
      });
      return;
    }
    
    const validation = SecurityValidator.validateAmount(ctx.match?.[1] || "0");
    if (!validation.valid) {
      logSecurityEvent('INVALID_AMOUNT_CALLBACK', ctx.from?.id, ctx.match?.[1]);
      await ctx.answerCallbackQuery({ text: validation.error!, show_alert: true });
      return;
    }
    ctx.session.amount = validation.value!;
    await handleAmount(ctx);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Amount selection failed:`, error);
    await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
  }
});

// Store pending deposit details keyed by deposit ID.  When a player
// submits a buy‑in and the bot displays a transaction card, we encode the
// deposit parameters in the callback payload.  Callback payloads are
// limited in size, so we also keep a temporary cache here to look up
// deposit details when the loader clicks Mark Paid.
const pendingDeposits: Record<string, {
  amount: number;
  method: string;
  userId: number;
  username: string;
}> = {};

// Custom amount prompt
bot.callbackQuery("AMT_CUSTOM", async (ctx: MyContext) => {
  try {
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.editMessageText(`Please enter the amount ($${MIN_BUYIN_AMOUNT}-${MAX_BUYIN_AMOUNT}):`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Custom amount prompt failed:`, error);
    await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
  }
});

// Resolve pay-to handle for CIRCLE methods
async function resolvePayToHandle(method: string): Promise<string> {
  const settings = await getCachedSettings();
  const upper = method.toUpperCase();
  const map: Record<string, string|undefined> = {
    VENMO: settings?.VENMO_HANDLE || FIXED_WALLETS.VENMO,
    ZELLE: settings?.ZELLE_HANDLE || FIXED_WALLETS.ZELLE,
    CASHAPP: settings?.CASHAPP_HANDLE || FIXED_WALLETS.CASHAPP,
    APPLE_PAY: settings?.APPLEPAY_HANDLE || FIXED_WALLETS.APPLE_PAY,
    CARD: settings?.CARD_HANDLE || FIXED_WALLETS.CARD,
  };
  const handle = map[upper];
  return handle && handle.trim() ? handle : '<ask owner for handle>';
}

// Withdrawal button handler
bot.callbackQuery("WITHDRAW", async (ctx: MyContext) => {
  try {
    await ctx.answerCallbackQuery().catch(() => {});
    await startWithdrawFlow(ctx);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Withdraw button failed:`, error);
    await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
  }
});

// Circle withdrawal channels
bot.callbackQuery(/^WD_CH_(VENMO|ZELLE|CASHAPP|APPLE_PAY|CARD)$/, async (ctx: MyContext) => {
  try {
    await ctx.answerCallbackQuery().catch(() => {});
    const method = ctx.match?.[1];
    if (!method) return;
    
    ctx.session.payoutType = 'CIRCLE';
    ctx.session.method = method;
    ctx.session.step = "WITHDRAW_AMOUNT";
    
    await ctx.editMessageText(MSG.withdrawAmountPrompt);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Circle withdrawal channel selection failed:`, error);
    await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
  }
});

// PayPal owner payout
bot.callbackQuery('WD_CH_PAYPAL', async (ctx: MyContext) => {
  try {
    await ctx.answerCallbackQuery().catch(() => {});
    ctx.session.payoutType = 'OWNER';
    ctx.session.channel = 'PAYPAL';
    ctx.session.step = "WITHDRAW_AMOUNT";

    await ctx.editMessageText(`You chose PayPal withdrawal.\n\n${MSG.withdrawAmountPrompt}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] PayPal withdrawal setup failed:`, error);
    await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
  }
});

// Crypto withdrawal
bot.callbackQuery('WD_CH_CRYPTO', async (ctx: MyContext) => {
  try {
    await ctx.answerCallbackQuery().catch(() => {});
    const coins = ['BTC','ETH','LTC','USDT_ERC20','USDT_TRC20','XRP','SOL'].filter(c => !!FIXED_WALLETS[c]);

    if (coins.length === 0) {
      await ctx.editMessageText('No crypto wallets configured. Please contact support.');
      return;
    }

    ctx.session.payoutType = 'OWNER';
    ctx.session.channel = 'CRYPTO';
    ctx.session.step = "CRYPTO_COIN";

    const kb = new InlineKeyboard();
    for (let i = 0; i < coins.length; i += 2) {
      const row = coins.slice(i, i + 2);
      if (row.length === 1) kb.text(row[0], `CRYPTO_${row[0]}`); else kb.text(row[0], `CRYPTO_${row[0]}`).text(row[1], `CRYPTO_${row[1]}`);
      if (i + 2 < coins.length) kb.row();
    }
    await ctx.editMessageText('Choose your crypto currency:', { reply_markup: kb });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Crypto withdrawal setup failed:`, error);
    await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
  }
});

// Crypto coin selection
bot.callbackQuery(/^CRYPTO_(.+)$/, async (ctx: MyContext) => {
  try {
    await ctx.answerCallbackQuery().catch(() => {});
    const coin = ctx.match?.[1];
    if (!coin) return;
    
    ctx.session.cryptoCoin = coin;
    ctx.session.step = "WITHDRAW_AMOUNT";
    
    const walletAddress = FIXED_WALLETS[coin] || 'Unknown';
    await ctx.editMessageText(`${coin} withdrawal will be sent to: ${walletAddress}\n\n${MSG.withdrawAmountPrompt}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Crypto coin selection failed:`, error);
    await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
  }
});

// Withdrawal method selection
bot.callbackQuery(/WITHDRAW_METHOD_(.+)/, async (ctx: MyContext) => {
  try {
    await ctx.answerCallbackQuery().catch(() => {});
    const method = ctx.match?.[1];
    if (!method) return;

    // Decide payout type based on method
    const settings = await getCachedSettings();
    const upper = method.toUpperCase();
    ctx.session.method = upper;
    if (settings.METHODS_CIRCLE.includes(upper)) {
      ctx.session.payoutType = 'CIRCLE';
      ctx.session.step = "WITHDRAW_AMOUNT";
      await ctx.editMessageText(MSG.withdrawAmountPrompt);
    } else if (upper === 'PAYPAL') {
      ctx.session.payoutType = 'OWNER';
      ctx.session.channel = 'PAYPAL';
      ctx.session.step = "WITHDRAW_AMOUNT";
      await ctx.editMessageText(MSG.withdrawAmountPrompt);
    } else if (upper === 'CRYPTO') {
      // route to crypto chooser
      ctx.session.payoutType = 'OWNER';
      ctx.session.channel = 'CRYPTO';
      ctx.session.step = "CRYPTO_COIN";
      const coins = ['BTC','ETH','LTC','USDT_ERC20','USDT_TRC20','XRP','SOL'].filter(c => !!FIXED_WALLETS[c]);
      const kb = new InlineKeyboard();
      for (let i = 0; i < coins.length; i += 2) {
        const row = coins.slice(i, i + 2);
        if (row.length === 1) kb.text(row[0], `CRYPTO_${row[0]}`); else kb.text(row[0], `CRYPTO_${row[0]}`).text(row[1], `CRYPTO_${row[1]}`);
        if (i + 2 < coins.length) kb.row();
      }
      await ctx.editMessageText('Choose your crypto currency:', { reply_markup: kb });
    } else {
      // default OWNER path for any other external method
      ctx.session.payoutType = 'OWNER';
      ctx.session.channel = upper;
      ctx.session.step = "WITHDRAW_AMOUNT";
      await ctx.editMessageText(MSG.withdrawAmountPrompt);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Withdraw method selection failed:`, error);
    await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
  }
});

// Submit withdrawal → send to loaders (do not write to sheet yet)
bot.callbackQuery("WITHDRAW_SUBMIT", async (ctx: MyContext) => {
  try {
    await ctx.answerCallbackQuery().catch(()=>{});
    if (!ctx.from) return;
    const { payoutType, channel, method, amount, tag, cryptoAddress } = ctx.session;
    const requestTimestampISO = ctx.session.requestTimestampISO || new Date().toISOString();
    if (!method || !amount) {
      await ctx.answerCallbackQuery({ text: "Missing withdrawal information. Please start over with /withdraw", show_alert: true });
      return;
    }
    const dest = payoutType === 'CIRCLE'
      ? tag
      : (channel === 'CRYPTO' ? cryptoAddress : tag);
    if (!dest) {
      await ctx.answerCallbackQuery({ text: "Destination missing. Please try again.", show_alert: true });
      return;
    }
    const requestId = `wd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const username = ctx.from.username ? `@${ctx.from.username}` : `${ctx.from.first_name || ""} ${ctx.from.last_name || ""}`.trim();

    // Post to loader group for approval
    const text = [
      '*Withdrawal Request*',
      `ID: ${requestId}`,
      `Player: ${username} (${ctx.from.id})`,
      `Amount: $${amount.toFixed(2)}`,
      `Method: ${method}`,
      `Destination: ${dest}`,
      `Type: ${payoutType}`,
      `Requested: ${requestTimestampISO}`,
    ].join('\\n');
    const kb = new InlineKeyboard()
      .text('✅ Approve', `APPROVE_WD:${requestId}:${ctx.from.id}:${Math.round(amount*100)}:${method}:${payoutType}`)
      .text('❌ Reject', `REJECT_WD:${requestId}`);
    if (Number.isFinite(LOADER_GROUP_ID)) {
      await bot.api.sendMessage(LOADER_GROUP_ID, text, { parse_mode: 'Markdown', reply_markup: kb });
    } else {
      console.error('LOADER_GROUP_ID missing/invalid; cannot notify loaders');
    }
    await ctx.reply('Submitted to loaders. You\'ll be queued after approval.\n' + MSG_FALLBACK);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Withdraw submit failed:`, error);
    await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
  }
});

// Loader approves → write QUEUED row to Withdrawals; also offer Match/Mark Paid
bot.callbackQuery(/^APPROVE_WD:(.+):(\d+):(\d+):([^:]+):(CIRCLE|OWNER)$/, async (ctx: MyContext) => {
  try {
    await ctx.answerCallbackQuery().catch(()=>{});
    const fromId = ctx.from?.id;
    if (!isAuthorizedLoader(fromId)) {
      await ctx.answerCallbackQuery({ text: "You are not authorized to approve.", show_alert: true });
      return;
    }
    const [_, requestId, userIdStr, amountCentsStr, method, payoutType] = ctx.match as any;
    const amount = Number(amountCentsStr)/100;
    const messageText = (ctx.callbackQuery?.message as any)?.text || (ctx.callbackQuery?.message as any)?.caption || '';
    const destMatch = messageText.match(/Destination:\s*(.+)/);
    const destination = destMatch ? destMatch[1] : '';
    const usernameMatch = messageText.match(/Player:\s*([^\n]+)/);
    const username = usernameMatch ? usernameMatch[1] : '';

    await appendWithdrawalRequest({
      request_id: requestId,
      user_id: userIdStr,
      username,
      amount_usd: amount,
      method,
      payment_tag_or_address: destination,
      request_timestamp_iso: new Date().toISOString(),
      status: 'QUEUED',
      payout_type: payoutType as any,
      notes: `approved_by:${fromId}`
    });

    // Edit loader message → add Match / Mark Paid buttons
    const kb = new InlineKeyboard()
      .text('🤝 Match (30m)', `MATCH_WD:${requestId}`)
      .text('✅ Mark Paid', `PAID_WD:${requestId}`);
    const text = (ctx.callbackQuery?.message as any)?.text || '';
    await ctx.editMessageText(text + '\n\nApproved and queued.', { reply_markup: kb });
  } catch (e) {
    console.error('APPROVE_WD failed', e);
    await ctx.answerCallbackQuery({ text: "Approval failed.", show_alert: true });
  }
});

bot.callbackQuery(/^REJECT_WD:(.+)$/, async (ctx: MyContext) => {
  try {
    await ctx.answerCallbackQuery().catch(()=>{});
    const fromId = ctx.from?.id;
    if (!isAuthorizedLoader(fromId)) {
      await ctx.answerCallbackQuery({ text: "Not authorized.", show_alert: true });
      return;
    }
    const requestId = ctx.match?.[1];
    const text = (ctx.callbackQuery?.message as any)?.text || '';
    await ctx.editMessageText(text + '\n\nRejected.');
  } catch {}
});

// Loader matches → set MATCHED and due_at_iso = now+30min
bot.callbackQuery(/^MATCH_WD:(.+)$/, async (ctx: MyContext) => {
  try {
    await ctx.answerCallbackQuery().catch(()=>{});
    const fromId = ctx.from?.id;
    if (!isAuthorizedLoader(fromId)) {
      await ctx.answerCallbackQuery({ text: "Not authorized.", show_alert: true });
      return;
    }
    const requestId = ctx.match?.[1];
    const due = new Date(Date.now()+30*60*1000).toISOString();
    await setWithdrawalStatus(requestId!, 'MATCHED', { matchedDueAtISO: due, notesAppend: `matched_by:${fromId}` });
    const text = (ctx.callbackQuery?.message as any)?.text || '';
    const kb = new InlineKeyboard().text('✅ Mark Paid', `PAID_WD:${requestId}`);
    await ctx.editMessageText(text + `\n\nMatched. Due by ${due}`, { reply_markup: kb });
  } catch (e) {
    console.error('MATCH_WD failed', e);
  }
});

// Loader marks paid → set PAID and remove buttons
bot.callbackQuery(/^PAID_WD:(.+)$/, async (ctx: MyContext) => {
  try {
    await ctx.answerCallbackQuery().catch(()=>{});
    const fromId = ctx.from?.id;
    if (!isAuthorizedLoader(fromId)) {
      await ctx.answerCallbackQuery({ text: "Not authorized.", show_alert: true });
      return;
    }
    const requestId = ctx.match?.[1];
    await setWithdrawalStatus(requestId!, 'PAID', { notesAppend: `paid_by:${fromId}` });
    const text = (ctx.callbackQuery?.message as any)?.text || '';
    await ctx.editMessageText(text + '\n\n✅ Paid', { reply_markup: undefined });
  } catch (e) {
    console.error('PAID_WD failed', e);
  }
});

// Manual requeue for expired MATCHED (e.g., via command)
bot.command('requeue_expired', async (ctx: MyContext) => {
  try {
    const fromId = ctx.from?.id;
    if (!isAuthorizedLoader(fromId)) return;
    const n = await requeueExpiredMatched();
    await ctx.reply(`Requeued ${n} expired withdrawals.`);
  } catch (e) {
    await ctx.reply('Requeue failed.');
  }
});

// Withdrawal confirmation (loader only) - legacy
bot.callbackQuery(/WITHDRAW_CONFIRM_(.+)/, async (ctx: MyContext) => {
  try {
    await handleWithdrawConfirm(ctx);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Withdraw confirm failed:`, error);
    await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
  }
});

// Handle text for custom amount and withdrawal
bot.on("message:text", async (ctx: MyContext) => {
  try {
    if (ctx.session.step === "AMOUNT" && ctx.message?.text) {
      // Player entering a buy‑in amount
      const amt = parseFloat(ctx.message.text.replace(/[^0-9.]/g, '') || '0');
      if (!amt || isNaN(amt)) {
        await ctx.reply("Please enter a valid number.");
        return;
      }
      if (amt < MIN_BUYIN_AMOUNT || amt > MAX_BUYIN_AMOUNT) {
        await ctx.reply(`Buy-in must be between $${MIN_BUYIN_AMOUNT} and $${MAX_BUYIN_AMOUNT}.`);
        return;
      }
      // Ensure a method was selected
      const method = ctx.session.method?.toUpperCase();
      if (!method) {
        await ctx.reply("Missing payment method. Please start over with /buyin.");
        return;
      }
      const userId = ctx.from?.id ?? 0;
      const username = ctx.from?.username ? `@${ctx.from.username}` : `${ctx.from?.first_name || ""} ${ctx.from?.last_name || ""}`.trim();
      // Determine where this deposit should be sent based on outstanding withdrawals.
      const matchResult = await matchDepositToWithdrawal(amt, method, String(userId), username);
      const payTo = matchResult.payTo || resolvePayToHandle(method);
      // Generate a deposit ID and cache details for callback
      const depositId = `dep_${Date.now()}_${Math.random().toString(36).substr(2,6)}`;
      pendingDeposits[depositId] = { amount: amt, method, userId, username };
      const kb = new InlineKeyboard().text("✅ Mark Paid", `MARKPAID_DEP:${depositId}`);
      await ctx.reply(
        `Pay $${amt.toFixed(2)} via ${method} to ${payTo}.\n\nThen post your payment screenshot in the group chat. A loader/owner will confirm.`,
        { reply_markup: kb }
      );
      // End buy-in flow for this player
      delete ctx.session.step;
      return;
    } else if (ctx.session.step === "WITHDRAW_AMOUNT" && ctx.message?.text) {
      // Rate limiting check
      const rateLimit = SecurityValidator.checkRateLimit(ctx.from?.id || 0);
      if (!rateLimit.allowed) {
        await ctx.reply(`Rate limit exceeded. Please wait ${Math.ceil((rateLimit.resetTime! - Date.now()) / 1000)} seconds.`);
        return;
      }
      
      const validation = SecurityValidator.validateAmount(ctx.message.text);
      if (!validation.valid) {
        logSecurityEvent('INVALID_WITHDRAW_AMOUNT', ctx.from?.id, ctx.message.text);
        await ctx.reply(validation.error!);
        return;
      }
      ctx.session.amount = validation.value!;
      
      // Check if this is a circle withdrawal (needs tag) or owner payout (doesn't need tag)
      if (ctx.session.payoutType === 'CIRCLE') {
        ctx.session.step = "WITHDRAW_TAG";
        await ctx.reply(MSG.withdrawTagPrompt);
      } else if (ctx.session.payoutType === 'OWNER') {
        // For owner payouts, we need the user's destination:
        if (ctx.session.channel === 'CRYPTO') {
          ctx.session.step = "CRYPTO_ADDRESS";
          await ctx.reply('Please enter your wallet address:');
        } else if (ctx.session.channel === 'PAYPAL') {
          ctx.session.step = "WITHDRAW_TAG";
          await ctx.reply('Please enter your PayPal email to receive the payout:');
        } else {
          ctx.session.requestTimestampISO = new Date().toISOString();
          await showWithdrawSummary(ctx);
        }
      }
    } else if (ctx.session.step === "WITHDRAW_TAG" && ctx.message?.text) {
      // Rate limiting check
      const rateLimit = SecurityValidator.checkRateLimit(ctx.from?.id || 0);
      if (!rateLimit.allowed) {
        await ctx.reply(`Rate limit exceeded. Please wait ${Math.ceil((rateLimit.resetTime! - Date.now()) / 1000)} seconds.`);
        return;
      }
      
      const tagValidation = SecurityValidator.validateAndSanitizeTag(ctx.message.text);
      if (!tagValidation.valid) {
        logSecurityEvent('INVALID_TAG_INPUT', ctx.from?.id, ctx.message.text);
        await ctx.reply(tagValidation.error!);
        return;
      }
      ctx.session.tag = tagValidation.value!;
      ctx.session.requestTimestampISO = new Date().toISOString();
      await showWithdrawSummary(ctx);
    } else if (ctx.session.step === "CRYPTO_ADDRESS" && ctx.message?.text) {
      // Rate limiting check
      const rateLimit = SecurityValidator.checkRateLimit(ctx.from?.id || 0);
      if (!rateLimit.allowed) {
        await ctx.reply(`Rate limit exceeded. Please wait ${Math.ceil((rateLimit.resetTime! - Date.now()) / 1000)} seconds.`);
        return;
      }
      
      // Basic validation for crypto address
      if (ctx.message.text.length < 10) {
        await ctx.reply('Please enter a valid wallet address.');
        return;
      }
      
      ctx.session.cryptoAddress = ctx.message.text;
      ctx.session.requestTimestampISO = new Date().toISOString();
      await showWithdrawSummary(ctx);
    } else if (ctx.session.step === "EXTERNAL_AMOUNT" && ctx.message?.text) {
      // Rate limiting check
      const rateLimit = SecurityValidator.checkRateLimit(ctx.from?.id || 0);
      if (!rateLimit.allowed) {
        await ctx.reply(`Rate limit exceeded. Please wait ${Math.ceil((rateLimit.resetTime! - Date.now()) / 1000)} seconds.`);
        return;
      }
      
      const validation = SecurityValidator.validateAmount(ctx.message.text);
      if (!validation.valid) {
        logSecurityEvent('INVALID_EXTERNAL_AMOUNT', ctx.from?.id, ctx.message.text);
        await ctx.reply(validation.error!);
        return;
      }
      
      ctx.session.externalAmount = validation.value!;
      ctx.session.step = "EXTERNAL_REFERENCE";
      await ctx.reply('Please enter a reference (optional - payment ID, note, etc.):');
    } else if (ctx.session.step === "EXTERNAL_REFERENCE" && ctx.message?.text) {
      // Rate limiting check
      const rateLimit = SecurityValidator.checkRateLimit(ctx.from?.id || 0);
      if (!rateLimit.allowed) {
        await ctx.reply(`Rate limit exceeded. Please wait ${Math.ceil((rateLimit.resetTime! - Date.now()) / 1000)} seconds.`);
        return;
      }
      
      ctx.session.externalReference = ctx.message.text;
      
             // Log the external deposit to Google Sheets
       try {
         const entryId = `ext_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
         const username = ctx.from?.username ? `@${ctx.from.username}` : `${ctx.from?.first_name || ""} ${ctx.from?.last_name || ""}`.trim();
         
         await appendExternalDeposit({
           entry_id: entryId,
           user_id: ctx.from?.id || 0,
           username,
           amount_usd: ctx.session.externalAmount || 0,
           method: 'CARD',
           reference: ctx.session.externalReference,
           created_at_iso: new Date().toISOString(),
           recorded_by_user_id: ctx.from?.id || 0
         });
         
         await ctx.reply(`✅ Stripe payment logged successfully!\nAmount: $${ctx.session.externalAmount}\nReference: ${ctx.session.externalReference}\n\nYour payment has been recorded in our system.`);
       } catch (error) {
         console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Error logging external deposit:`, error);
         await ctx.reply('Error logging external deposit. Please try again.');
       }
      
      ctx.session = {}; // Reset session
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Text message handling failed:`, error);
    await ctx.reply("Sorry, something went wrong. Please try again.");
  }
});

async function handleAmount(ctx: MyContext) {
  try {
    const method = ctx.session.method;
    const amount = ctx.session.amount;
    if (!method || !amount || !ctx.from) return;

    const settings = await getCachedSettings();
    const owners = await getCachedOwnerAccounts();

    const match = await findMatch(method, amount, owners, settings.OWNER_FALLBACK_THRESHOLD);

    // Generate unique buy-in ID
    const buyinId = generateBuyinId();

    // Create transaction record
    const transaction: Transaction = {
      buyinId,
      playerId: ctx.from.id,
      playerUsername: ctx.from.username,
      playerFirstName: ctx.from.first_name,
      method,
      amount,
      match,
      timestamp: Date.now()
    };

    // Store transaction
    activeTransactions.set(buyinId, transaction);

    // 1) DM to player: NO button; instruction to send screenshot in group
    const playerTag = ctx.from?.username ? `@${ctx.from.username}` : `${ctx.from?.first_name || "Player"} (${ctx.from?.id})`;
    const recv = match.type === "CASHOUT" ? (match.receiver || "<ask recipient>") : match.owner?.handle || "<ask owner>";

    if (match.type === "CASHOUT") {
      await ctx.reply(
        truncateMessage(MSG.playerMatchedPay(match.amount, settings.CURRENCY, match.method, recv)),
        { parse_mode: "Markdown" }
      );
    } else {
      await ctx.reply(
        truncateMessage(MSG.playerOwnerPay(amount, settings.CURRENCY, match.method, match.owner?.handle || "<ask owner>", match.owner?.instructions)),
        { parse_mode: "Markdown" }
      );
    }

    // 2) Post to loader group WITH Mark Paid button
    const groupId = getLoaderGroupId();
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Loader group ID:`, groupId);
    
    const callbackRequestId = match.type === 'CASHOUT' ? (match.request_id || 'NONE') : 'NONE';
    const kb = {
      inline_keyboard: [
        [{ text: "✅ Mark Paid", callback_data: `MARKPAID:${buyinId}:${callbackRequestId}` }]
      ]
    };
    
    if (groupId != null) {
      try {
        const text = truncateMessage(MSG.groupCard(playerTag, amount, settings.CURRENCY, match.method, recv));
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Posting to group:`, groupId, 'with button:', JSON.stringify(kb));
        const sent = await bot.api.sendMessage(groupId, text, { parse_mode: "Markdown", reply_markup: kb });

        // Store group message info
        transaction.groupMessageId = sent.message_id;
        transaction.groupChatId = sent.chat.id;
        activeTransactions.set(buyinId, transaction);
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Successfully posted transaction card to group`);

      } catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Error posting to loader group:`, error);
        // Fallback: post to private chat with button
        const fallbackText = `🧾 *Transaction Card* (Group posting failed)\n\n` + truncateMessage(MSG.groupCard(playerTag, amount, settings.CURRENCY, match.method, recv));
        await ctx.reply(fallbackText, { parse_mode: "Markdown", reply_markup: kb });
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Posted transaction card to private chat as fallback`);
      }
    } else {
      console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] No valid LOADER_GROUP_ID found, posting to private chat`);
      // Post to private chat with button if no group ID
      const fallbackText = `🧾 *Transaction Card*\n\n` + truncateMessage(MSG.groupCard(playerTag, amount, settings.CURRENCY, match.method, recv));
      await ctx.reply(fallbackText, { parse_mode: "Markdown", reply_markup: kb });
      console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Posted transaction card to private chat`);
    }

    ctx.session = {}; // reset
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Handle amount failed:`, error);
    await ctx.reply("Sorry, something went wrong. Please try again.");
  }
}

// Restricted Mark Paid handler
bot.callbackQuery(/^MARKPAID:([^:]+):([^:]*)$/, async (ctx: MyContext) => {
  try {
    const fromId = ctx.from?.id;
    if (!fromId) return;
    await ctx.answerCallbackQuery().catch(() => {});
    
    // Rate limiting check
    const rateLimit = SecurityValidator.checkRateLimit(fromId);
    if (!rateLimit.allowed) {
      await ctx.answerCallbackQuery({ 
        text: `Rate limit exceeded. Please wait ${Math.ceil((rateLimit.resetTime! - Date.now()) / 1000)} seconds.`, 
        show_alert: true 
      });
      return;
    }

    // Validate callback data
    const callbackData = ctx.callbackQuery?.data || '';
    const validation = SecurityValidator.validateCallbackData(callbackData, /^MARKPAID:([^:]+):([^:]*)$/);
    if (!validation.valid) {
      logSecurityEvent('INVALID_MARKPAID_CALLBACK', fromId, callbackData);
      await ctx.answerCallbackQuery({ text: "Invalid callback data", show_alert: true });
      return;
    }
    
    // Check if user is in the allowed list
    if (!isAuthorized(fromId)) {
      logSecurityEvent('UNAUTHORIZED_MARK_PAID_ATTEMPT', fromId, callbackData);
      await ctx.answerCallbackQuery({ 
        text: "You are not authorized to mark this payment as paid.", 
        show_alert: true 
      });
      return;
    }

    const buyinId = ctx.match?.[1];
    const requestId = ctx.match?.[2]; // 'NONE' or empty string for owner route

    // Update Google Sheet if a cashout row exists (non-blocking)
    const iso = new Date().toISOString();
    if (requestId && requestId !== 'NONE') {
      // Update UI immediately, then update sheet in background
      updateWithdrawalStatusById(requestId, 'PAID', `${fromId}`)
        .then(() => {
          console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Sheet updated successfully for ${requestId}`);
        })
        .catch((e) => {
          console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] updateWithdrawalStatusById failed:`, e);
        });
    }

    // Edit the group card message to show confirmation and remove the button
    const verifier = ctx.from?.username ? `@${ctx.from.username}` : `${ctx.from?.first_name || "Loader"} (${fromId})`;
    try {
      await ctx.editMessageText(truncateMessage(MSG.paidConfirmed(verifier, iso)), {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [] }
      });
    } catch (e) {
      console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] editMessageText failed:`, e);
    }

    await ctx.answerCallbackQuery({ text: "Marked as paid ✅" });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Mark paid failed:`, error);
    await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
  }
});

// Group onboarding (safe guard pattern)
bot.on("my_chat_member", async (ctx: MyContext) => {
  try {
    if (!("my_chat_member" in ctx.update)) return;
    const upd = ctx.update.my_chat_member;
    if (!upd) return; // Type guard for strict TS
    const chatId = upd.chat.id;
    try {
      const welcomeText = `Hi 👋 — type /start here to buy in or type /help for instructions.`;
      
      // Send and try to pin the welcome message
      try {
        const message = await ctx.api.sendMessage(chatId, welcomeText, { parse_mode: "Markdown" });
        await ctx.api.pinChatMessage(chatId, message.message_id);
      } catch (error) {
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Could not pin message (bot may not be admin):`, error);
      }
    } catch (e) {
      console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] my_chat_member welcome failed:`, e);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Chat member handling failed:`, error);
  }
});

// First-time user reminder (if privacy hints enabled)
if (PRIVACY_HINTS_ENABLED) {
  bot.on('message', async (ctx: MyContext, next: () => Promise<void>) => {
    try {
      if (!(ctx as any).from || !(ctx as any).chat || (ctx as any).chat.type === 'private') return;
      
      const groupSession = getGroupSession((ctx as any).chat.id);
      
      // Check if this is a first-time user in this group
      if (!groupSession.firstTimeUsers.has((ctx as any).from.id)) {
        groupSession.firstTimeUsers.add((ctx as any).from.id);
        
        // Send gentle reminder
        try {
          await ctx.reply('Hi 👋 — type /start here to buy in or type /help for instructions.');
        } catch (error) {
          console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Error sending first-time reminder:`, error);
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] First-time user handling failed:`, error);
    }
    await next(); // Important: let other handlers run
  });
}

// Withdrawal functions
async function startWithdrawFlow(ctx: MyContext) {
  try {
    if (!ctx.from) return;
    ctx.session = {}; // Reset session
    const kb = new InlineKeyboard()
      .text('Venmo', 'WD_CH_VENMO').text('Zelle', 'WD_CH_ZELLE').row()
      .text('CashApp', 'WD_CH_CASHAPP');
    // Conditionally add Card / Apple Pay
    const s = await getCachedSettings().catch(()=>null);
    const wantCard = !!(s?.METHODS_CIRCLE?.includes('CARD') || FIXED_WALLETS.CARD);
    const wantApple = !!(s?.METHODS_CIRCLE?.includes('APPLE_PAY') || FIXED_WALLETS.APPLE_PAY);
    if (wantApple || wantCard) kb.row();
    if (wantApple) kb.text('Apple Pay', 'WD_CH_APPLE_PAY');
    if (wantCard) kb.text('Card', 'WD_CH_CARD');
    kb.row().text('PayPal', 'WD_CH_PAYPAL').text('Crypto', 'WD_CH_CRYPTO');
    await ctx.editMessageText(MSG.withdrawWelcome + `\n\n${MSG_FALLBACK}`, { reply_markup: kb });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Start withdraw flow failed:`, error);
    throw error;
  }
}

async function showWithdrawSummary(ctx: MyContext) {
  try {
    if (!ctx.from) return;
    const { payoutType, channel, method, amount, tag, cryptoAddress } = ctx.session;
    if (!method || !amount) {
      await ctx.reply("Missing withdrawal information. Please start over with /withdraw");
      return;
    }
    // Validate destination depending on type/channel
    let destination: string | undefined;
    if (payoutType === 'CIRCLE') {
      if (!tag) {
        await ctx.reply("Please provide your handle/phone to receive funds.");
        return;
      }
      destination = tag;
    } else {
      if (channel === 'CRYPTO') {
        if (!cryptoAddress) {
          await ctx.reply("Please provide your wallet address.");
          return;
        }
        destination = cryptoAddress;
      } else if (channel === 'PAYPAL') {
        if (!tag) {
          await ctx.reply("Please provide your PayPal email.");
          return;
        }
        destination = tag;
      } else {
        // generic external channel uses tag as destination
        if (!tag) {
          await ctx.reply("Please provide your payout destination.");
          return;
        }
        destination = tag;
      }
    }

    const summary = truncateMessage(
      `Review your withdrawal:\n• Method: ${method}\n• Amount: $${amount.toFixed(2)}\n• Destination: ${destination}\n\nTap "Submit Withdrawal" to send to loaders for approval.\n\n${MSG_FALLBACK}`
    );
    const kb = new InlineKeyboard().text("Submit Withdrawal", "WITHDRAW_SUBMIT");
    await ctx.reply(summary, { reply_markup: kb });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Show withdraw summary failed:`, error);
    throw error;
  }
}

async function handleWithdrawSubmit(ctx: MyContext) {
  try {
    if (!ctx.from) return;
    
    const { method, amount, tag, requestTimestampISO } = ctx.session;
    if (!amount || !requestTimestampISO) {
      await ctx.answerCallbackQuery({ text: "Missing withdrawal information. Please start over with /withdraw", show_alert: true });
      return;
    }
    const requestId = `wd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const username = ctx.from.username ? `@${ctx.from.username}` : `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim();
    try {
      // Get available methods to determine if this is circle or owner
      const { circleMethods, ownerMethods } = await getAvailableMethods();
      const isCircleMethod = method ? circleMethods.includes(method) : false;

      if (isCircleMethod) {
        // Circle withdrawal - use existing flow
        if (!method || !tag) {
          await ctx.answerCallbackQuery({ text: "Missing withdrawal information. Please start over with /withdraw", show_alert: true });
          return;
        }

        await appendWithdrawalCircle({
          request_id: requestId,
          user_id: ctx.from.id,
          username,
          amount_usd: amount,
          method: method!,
          payment_tag_or_address: tag!,
          request_timestamp_iso: requestTimestampISO,
          notes: 'Circle withdrawal request'
        });

        await ctx.answerCallbackQuery();
        await ctx.editMessageText(MSG.withdrawSubmitted);

        const groupId = getLoaderGroupId();
        if (groupId != null) {
          const card =
            `🧾 *Withdrawal (Circle)*\n` +
            `ID: ${requestId}\nUser: ${username} (${ctx.from.id})\n` +
            `Method: ${method}\nAmount: $${amount.toFixed(2)}\nTag: ${tag}\n` +
            `Requested at: ${requestTimestampISO}\nStatus: QUEUED`;
          try {
            await bot.api.sendMessage(groupId, truncateMessage(card), { parse_mode: 'Markdown' });
          } catch (e) {
            console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Circle withdraw notify failed:`, e);
          }
        }
      } else {
        // Owner withdrawal - goes to Withdrawals with LOGGED status and Owner Payouts
        // For OWNER: destination can be PayPal email (tag) or cryptoAddress.
        const destination = ctx.session.channel === 'CRYPTO' ? ctx.session.cryptoAddress : ctx.session.tag;
        if (!method || !destination) {
          await ctx.answerCallbackQuery({ text: "Missing withdrawal information. Please start over with /withdraw", show_alert: true });
          return;
        }

        await appendWithdrawalOwner({
          request_id: requestId,
          user_id: ctx.from.id,
          username,
          amount_usd: amount,
          method: method!,
          payment_tag_or_address: destination!,
          request_timestamp_iso: requestTimestampISO,
          notes: 'Owner withdrawal request'
        });

        await ctx.answerCallbackQuery();
        await ctx.editMessageText('Withdrawal submitted for direct payout. Loaders will mark it paid once processed.');

        const groupId = getLoaderGroupId();
        if (groupId != null) {
          const card =
            `🧾 *Owner Payout Request*\n` +
            `ID: ${requestId}\nUser: ${username} (${ctx.from.id})\n` +
            `Method: ${method}\nAmount: $${amount.toFixed(2)}\nDestination: ${destination}\n` +
            `Requested at: ${requestTimestampISO}\nStatus: PENDING`;
          const kb = { inline_keyboard: [[{ text: '✅ Mark Paid', callback_data: `WITHDRAW_CONFIRM_${requestId}` }]] };
          try {
            await bot.api.sendMessage(groupId, truncateMessage(card), { parse_mode: 'Markdown', reply_markup: kb });
          } catch (e) {
            console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Owner payout notify failed:`, e);
            await ctx.reply(card, { parse_mode: 'Markdown', reply_markup: kb });
          }
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Error creating withdrawal request:`, error);
      await ctx.answerCallbackQuery({ text: 'Error creating withdrawal request. Please try again.', show_alert: true });
    }
    ctx.session = {};
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Handle withdraw submit failed:`, error);
    throw error;
  }
}

async function handleWithdrawConfirm(ctx: MyContext) {
  try {
    const fromId = ctx.from?.id;
    if (!fromId) return;
    
    // Check if user is authorized
    if (!isAuthorized(fromId)) {
      await ctx.answerCallbackQuery({ text: MSG.notAuthorizedWithdraw, show_alert: true });
      return;
    }
    
    const requestId = ctx.match?.[1];
    if (!requestId) return;
    
    try {
      // Update withdrawal status to PAID
      await updateWithdrawalStatusById(requestId, 'PAID', `${fromId}`);
      
      // Update the message to show confirmation
      const verifier = ctx.from?.username ? `@${ctx.from.username}` : `${ctx.from?.first_name || "Admin"} (${fromId})`;
      await ctx.editMessageText(`✅ Withdrawal marked as paid by ${verifier} at ${new Date().toISOString()}`, {
        reply_markup: { inline_keyboard: [] }
      });
      
      // Also mark OwnerPayouts row as paid if this was a direct payout
      try {
        await markOwnerPayoutPaid(requestId, fromId, `Marked paid by ${verifier}`);
      } catch (e) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] markOwnerPayoutPaid failed:`, e);
      }
      
      await ctx.answerCallbackQuery({ text: "Withdrawal marked as paid ✅" });
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Error confirming withdrawal:`, error);
      await ctx.answerCallbackQuery({ text: "Error confirming withdrawal. Please try again.", show_alert: true });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Handle withdraw confirm failed:`, error);
    throw error;
  }
}

// Generate unique withdrawal request ID
function generateWithdrawId(): string {
  return `wd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

// Deposit Transaction Card and Mark Paid
async function showBuyinTransactionCard(ctx: MyContext) {
  const { method, amount } = ctx.session;
  if (!method) {
    await ctx.reply("Error: No payment method selected. Please try again.");
    return;
  }
  const payTo = await resolvePayToHandle(method);
  const depositId = `dep_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const username = ctx.from?.username ? `@${ctx.from.username}` : `${ctx.from?.first_name || ""} ${ctx.from?.last_name || ""}`.trim();
  const msg = [
    '*Transaction Card*',
    '',
    '*Transaction*',
    `Player: ${username}`,
    `Amount: ${amount} USD`,
    `Method: ${method}`,
    `Pay to: ${payTo}`,
  ].join('\n');
  // keep callback payload compact: include uid, amount cents, method
  const cents = Math.round(Number(amount)*100);
  const kb = new InlineKeyboard().text('✅ Mark Paid', `MARKPAID_DEP:${depositId}:${ctx.from!.id}:${cents}:${method}`);
  await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: kb });
}

// Authorized loaders mark deposit paid → log to Deposits
bot.callbackQuery(/^MARKPAID_DEP:([^:]+):(\d+):(\d+):([^:]+)$/, async (ctx: MyContext) => {
  try {
    await ctx.answerCallbackQuery().catch(() => {});
    const fromId = ctx.from?.id;
    if (!isAuthorizedLoader(fromId)) {
      await ctx.answerCallbackQuery({ text: "You are not authorized to mark this as paid.", show_alert: true });
      return;
    }
    const [_, depId, userIdStr, amountCentsStr, method] = ctx.match as any;
    const amount = Number(amountCentsStr)/100;
    const messageText = (ctx.callbackQuery?.message as any)?.text || (ctx.callbackQuery?.message as any)?.caption || '';
    const userMatch = messageText.match(/Player:\s*([^\n]+)/);
    const username = userMatch ? userMatch[1] : '';
    const payToMatch = messageText.match(/Pay to:\s*([^\n]+)/);
    const payTo = payToMatch ? payToMatch[1] : await resolvePayToHandle(method);

    // Append as PAID at time of confirmation
    await appendDeposit({
      deposit_id: depId,
      user_id: userIdStr,
      username,
      amount_usd: amount,
      method: method as any,
      pay_to_handle: payTo,
      created_at_iso: new Date().toISOString(),
      status: 'PAID',
      notes: `Marked by ${fromId}`
    }).catch(()=>{});

    // Edit the message to reflect success and remove the button
    try {
      const text = (ctx.callbackQuery?.message as any)?.text || (ctx.callbackQuery?.message as any)?.caption || '';
      await ctx.editMessageText(text + "\n\n✅ Paid", { reply_markup: undefined });
    } catch {}
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] MARKPAID_DEP failed:`, error);
    await ctx.answerCallbackQuery({ text: "Failed to mark as paid. Try again.", show_alert: true });
  }
});

// External deposit logging
bot.callbackQuery('EXTERNAL_DEPOSIT_LOG', async (ctx: MyContext) => {
  try {
    ctx.session.step = "EXTERNAL_AMOUNT";
    await ctx.editMessageText('Please enter the amount you paid via Stripe:');
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] External deposit log setup failed:`, error);
    await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
  }
});

// Deposit confirmation handler: invoked when a loader clicks the
// ✅ Mark Paid button on a transaction card.  This will either
// reduce an existing withdrawal or log the deposit to the Deposits
// sheet.  Authorization is enforced via LOADER_IDS unless
// SKIP_ENFORCEMENT=true.
bot.callbackQuery(/^MARKPAID_DEP:(.+)$/, async (ctx: MyContext) => {
  try {
    await ctx.answerCallbackQuery().catch(() => {});
    const depositId = ctx.match?.[1];
    if (!depositId) return;
    const loaderId = ctx.from?.id;
    if (!loaderId) return;
    const authorizedIds = (process.env.LOADER_IDS || '').split(',').map(s => s.trim()).filter(Boolean).map(Number);
    const skipEnforcement = (process.env.SKIP_ENFORCEMENT || '').toLowerCase() === 'true';
    if (!skipEnforcement && !authorizedIds.includes(loaderId)) {
      await ctx.reply('You are not authorized to mark deposits as paid.');
      return;
    }
    const depositInfo = pendingDeposits[depositId];
    if (!depositInfo) {
      await ctx.reply('Deposit information not found. Please try again.');
      return;
    }
    const { amount, method, userId, username } = depositInfo;
    delete pendingDeposits[depositId];
    // Attempt to match this deposit to an open withdrawal and update the sheet
    const matchResult = await matchDepositToWithdrawal(amount, method, String(loaderId), ctx.from?.username ? '@' + ctx.from.username : String(loaderId));
    if (!matchResult.matchedWithdrawal) {
      // No matching withdrawal: log this deposit in Deposits sheet
      await appendDeposit({
        deposit_id: depositId,
        user_id: userId,
        username,
        amount_usd: amount,
        method,
        pay_to_handle: matchResult.payTo || resolvePayToHandle(method),
        created_at_iso: new Date().toISOString(),
        status: 'PAID',
        notes: `Circle deposit confirmed by ${ctx.from?.username ? '@' + ctx.from.username : loaderId}`
      });
    }
    // Edit the original message to indicate success and remove the button
    try {
      const original = ctx.msg?.text || '';
      await ctx.editMessageText(original + '\n\n✅ Paid');
    } catch (_) {
      // ignore edit errors
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Deposit mark paid failed:`, error);
    await ctx.reply('An error occurred while marking the deposit as paid.');
  }
});

// Owner payout confirmation - disabled until new implementation
// bot.callbackQuery(/^WD_OWNER_PAID:(.+)$/, async (ctx: MyContext) => {
//   try {
//     const fromId = ctx.from?.id;
//     if (!fromId) return;
//     
//     // Check if user is authorized
//     if (!isAuthorized(fromId)) {
//       await ctx.answerCallbackQuery({ text: "Not authorized.", show_alert: true });
//       return;
//     }
//     
//     const payoutId = ctx.match?.[1];
//     if (!payoutId) return;
//     
//     try {
//       // TODO: Implement new owner payout marking
//       // await markOwnerPayoutPaid(payoutId, fromId, 'Marked as paid by admin');
//       
//       // Update the message to show confirmation
//       const verifier = ctx.from?.username ? `@${ctx.from.username}` : `${ctx.from?.first_name || "Admin"} (${fromId})`;
//       await ctx.editMessageText(`✅ Owner payout marked as paid by ${verifier} at ${new Date().toISOString()}`, {
//         reply_markup: { inline_keyboard: [] }
//       });
//       
//       await ctx.answerCallbackQuery({ text: "Owner payout marked as paid ✅" });
//     } catch (error) {
//       console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Error marking owner payout paid:`, error);
//       await ctx.answerCallbackQuery({ text: "Error marking payout as paid. Please try again.", show_alert: true });
//     }
//   } catch (error) {
//     console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Owner payout confirmation failed:`, error);
//     await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
//   }
// });

// Ledger commands - disabled until new implementation
// bot.command('adjust', async (ctx: MyContext) => {
//   try {
//     if (!ctx.from) return;
//     
//     // Check if user is authorized
//     if (!isAuthorized(ctx.from.id)) {
//       await ctx.reply('Not authorized.');
//       return;
//     }
//     
//     const text = ctx.message?.text || '';
//     const parts = text.split(' ');
//     
//     if (parts.length < 4) {
//       await ctx.reply('Usage: /adjust <@user_or_id> <+/-amount> <note...>');
//       return;
//     }
//     
//     // Parse user ID (can be @username or numeric ID)
//     let userId: number;
//     const userPart = parts[1];
//     
//     if (userPart.startsWith('@')) {
//       // @username - would need to resolve username to ID
//       await ctx.reply('Username resolution not implemented. Please use numeric user ID.');
//       return;
//     } else {
//       userId = Number(userPart);
//       if (!Number.isFinite(userId) || userId <= 0) {
//         await ctx.reply('Invalid user ID. Please provide a valid numeric user ID.');
//         return;
//       }
//     }
//     
//     // Parse amount
//     const amountStr = parts[2];
//     const deltaCents = Math.round(Number(amountStr) * 100);
//     
//     if (!Number.isFinite(deltaCents)) {
//       await ctx.reply('Invalid amount. Please provide a valid number.');
//       return;
//     }
//     
//     // Get note (everything after amount)
//     const note = parts.slice(3).join(' ');
//     
//     // Get username for the target user (would need to be provided or looked up)
//     const username = `User_${userId}`; // Placeholder
//     
//     try {
//       // TODO: Implement new ledger adjustment
//       // const newBalanceCents = await upsertLedger(userId, username, deltaCents, note);
//       // const newBalance = (newBalanceCents / 100).toFixed(2);
//       
//       await ctx.reply(`✅ Balance adjusted successfully.\nNew balance: $0.00\nAdjustment: ${amountStr}\nNote: ${note}`);
//     } catch (error) {
//       console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Error adjusting ledger:`, error);
//       await ctx.reply('Error adjusting balance. Please try again.');
//     }
//   } catch (error) {
//     console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Adjust command failed:`, error);
//     await ctx.reply('Sorry, something went wrong. Please try again.');
//   }
// });

// bot.command('balance', async (ctx: MyContext) => {
//   try {
//     if (!ctx.from) return;
//     
//     const text = ctx.message?.text || '';
//     const parts = text.split(' ');
//     
//     let targetUserId: number;
//     
//     if (parts.length > 1) {
//       // Check if user is authorized to check other users' balances
//       if (!isAuthorized(ctx.from.id)) {
//         await ctx.reply('Not authorized to check other users\' balances.');
//         return;
//       }
//       
//       const userPart = parts[1];
//       if (userPart.startsWith('@')) {
//         await ctx.reply('Username resolution not implemented. Please use numeric user ID.');
//         return;
//       } else {
//         targetUserId = Number(userPart);
//         if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
//           await ctx.reply('Invalid user ID. Please provide a valid numeric user ID.');
//           return;
//         }
//       }
//     } else {
//       // Check own balance
//       targetUserId = ctx.from.id;
//     }
//     
//     try {
//       // TODO: Implement new ledger balance lookup
//       // const balanceCents = await getLedgerBalance(targetUserId);
//       // const balance = (balanceCents / 100).toFixed(2);
//       
//       const username = targetUserId === ctx.from.id ? 
//         (ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || 'You') :
//         `User_${targetUserId}`;
//       
//       await ctx.reply(`${username}'s balance: $0.00`);
//     } catch (error) {
//       console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Error getting balance:`, error);
//       await ctx.reply('Error retrieving balance. Please try again.');
//     }
//   } catch (error) {
//     console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Balance command failed:`, error);
//     await ctx.reply('Sorry, something went wrong. Please try again.');
//   }
// });

// Get available methods from Settings + env fallback
async function getAvailableMethods(): Promise<{
  circleMethods: string[];
  ownerMethods: string[];
  allMethods: string[];
}> {
  try {
    const settings = await getSettings();
    
    // Get circle methods from settings
    const circleMethods = settings.METHODS_CIRCLE || METHODS_CIRCLE;
    
    // Build owner methods list from configured handles
    const ownerMethods: string[] = [];
    if (settings.APPLE_PAY_HANDLE) ownerMethods.push('APPLE PAY');
    if (settings.CASHAPP_HANDLE) ownerMethods.push('CASHAPP');
    if (settings.PAYPAL_EMAIL) ownerMethods.push('PAYPAL');
    if (settings.CRYPTO_WALLET_BTC) ownerMethods.push('BTC');
    if (settings.CRYPTO_WALLET_ETH) ownerMethods.push('ETH');
    if (settings.CRYPTO_WALLET) {
      const networks = settings.CRYPTO_NETWORKS || [];
      for (const network of networks) {
        const upper = network.trim().toUpperCase();
        if (upper !== 'BTC' && upper !== 'ETH' && !ownerMethods.includes(upper)) {
          ownerMethods.push(upper);
        }
      }
    }
    
    // Combine all methods
    const allMethods = [...new Set([...circleMethods, ...ownerMethods])];
    
    return { circleMethods, ownerMethods, allMethods };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to get available methods:`, error);
    // Fallback to env defaults
    return {
      circleMethods: METHODS_CIRCLE,
      ownerMethods: [ZELLE_HANDLE, VENMO_HANDLE, CASHAPP_HANDLE, PAYPAL_HANDLE].filter(Boolean).map(h => h?.split('@')[1]?.toUpperCase() || 'UNKNOWN'),
      allMethods: [...METHODS_CIRCLE, ...(ZELLE_HANDLE ? ['ZELLE'] : []), ...(VENMO_HANDLE ? ['VENMO'] : []), ...(CASHAPP_HANDLE ? ['CASHAPP'] : []), ...(PAYPAL_HANDLE ? ['PAYPAL'] : [])]
    };
  }
}

const app = express();
app.use(express.json());
app.get("/", (_req, res) => res.send("OK"));

// Add health check endpoint
app.get("/health", (_req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    client: CLIENT_NAME,
    botToken: BOT_TOKEN ? "SET" : "MISSING",
    baseUrl: BASE_URL || "NOT_SET"
  });
});

// Check if we're in development mode (local testing)
const isDevelopment = process.env.NODE_ENV === 'development' || !BASE_URL;

if (BASE_URL && !isDevelopment) {
  console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Starting bot with webhook mode`);
  console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] BASE_URL: ${BASE_URL}`);
  console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] BOT_TOKEN: ${BOT_TOKEN ? "SET" : "MISSING"}`);
  
  // Add debug logging for webhook requests
  app.use(`/${BOT_TOKEN}`, (req, res, next) => {
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Webhook request received:`, {
      method: req.method,
      url: req.url,
      body: req.body,
      headers: req.headers
    });
    next();
  });
  
  // Add error handling to webhook callback
  const webhookHandler = webhookCallback(bot, "express");
  app.use(`/${BOT_TOKEN}`, webhookHandler);
  
  app.listen(PORT, async () => {
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Server started on port ${PORT}`);
    try {
      const base = BASE_URL.replace(/\/+$/, "");
      const url = `${base}/${BOT_TOKEN}`;
      console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Setting webhook to: ${url}`);
      await bot.api.setWebhook(url);
      console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Webhook set successfully`);
      
      // Verify webhook was set
      const webhookInfo = await bot.api.getWebhookInfo();
      console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Webhook info:`, webhookInfo);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to set webhook:`, error);
    }
  });
} else {
  console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Starting bot with long polling mode (development/local)`);
  
  // Delete any existing webhook first
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Deleted existing webhook`);
  } catch (error) {
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] No webhook to delete or error:`, (error as Error).message);
  }
  
  app.listen(PORT, () => {
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Server on :${PORT} (long polling)`);
  });
  
  // Start the bot with polling
  bot.start({
    drop_pending_updates: true,
    onStart: () => {
      console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] ✅ Bot started successfully with polling`);
    }
  });
}
