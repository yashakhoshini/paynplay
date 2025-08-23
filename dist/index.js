import { Bot, session, InlineKeyboard } from "grammy";
import express from "express";
import { webhookCallback } from "grammy";
import { BOT_TOKEN, BASE_URL, PORT, PRIVACY_HINTS_ENABLED, EFFECTIVE_ALLOWED_USER_IDS, MAX_BUYIN_AMOUNT, MIN_BUYIN_AMOUNT, SESSION_TIMEOUT_MS, MAX_MESSAGE_LENGTH, CLIENT_NAME, ZELLE_HANDLE, VENMO_HANDLE, CASHAPP_HANDLE, PAYPAL_HANDLE, METHODS_CIRCLE, METHODS_EXTERNAL_LINK, STRIPE_CHECKOUT_URL, FIXED_WALLETS, METHODS_ENABLED_DEFAULT, DEFAULT_CURRENCY, DEFAULT_FAST_FEE, OWNER_FALLBACK_THRESHOLD, OWNER_TG_USERNAME } from "./config.js";
import { MSG } from "./messages.js";
import { getSettings, getOwnerAccounts, appendWithdrawalCircle, appendWithdrawalOwner, updateWithdrawalStatusById } from "./sheets.js";
import { findMatch } from "./matcher.js";
import { SecurityValidator, logSecurityEvent } from "./security.js";
function initial() {
    return { lastActivity: Date.now() };
}
// Store active transactions and group sessions
const activeTransactions = new Map();
const groupSessions = new Map();
const sheetsCache = {
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
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Cache refresh failed:`, error);
    }
}, CACHE_TTL); // Refresh every 5 minutes
// Stale sweeper timer (every 10 minutes) - disabled until new implementation
// setInterval(async () => {
//   try {
//     // TODO: Implement new stale withdrawal marking
//     // await markStaleCashAppCircleWithdrawals(WITHDRAW_STALE_HOURS);
//   } catch (e) {
//     console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Stale sweep failed:`, e);
//   }
// }, 10 * 60 * 1000); // Every 10 minutes
// Generate unique buy-in ID
function generateBuyinId() {
    return `B-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
// Get or create group session
function getGroupSession(chatId) {
    if (!groupSessions.has(chatId)) {
        groupSessions.set(chatId, { firstTimeUsers: new Set() });
    }
    return groupSessions.get(chatId);
}
// Use the secure validation from SecurityValidator
function validateAmount(amount) {
    const result = SecurityValidator.validateAmount(amount);
    return { valid: result.valid, error: result.error };
}
// Truncate message if too long
function truncateMessage(message, maxLength = MAX_MESSAGE_LENGTH) {
    if (message.length <= maxLength)
        return message;
    return message.substring(0, maxLength - 3) + '...';
}
// Enhanced authorization check
function isAuthorized(userId) {
    if (!EFFECTIVE_ALLOWED_USER_IDS || EFFECTIVE_ALLOWED_USER_IDS.length === 0) {
        console.warn(`[${new Date().toISOString()}] [${CLIENT_NAME}] No authorized users configured`);
        return false;
    }
    const isAllowed = EFFECTIVE_ALLOWED_USER_IDS.includes(userId);
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
    return new Bot(BOT_TOKEN);
}
const bot = initializeBot();
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
bot.on('message', async (ctx, next) => {
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Received message:`, {
        from: ctx.from?.id,
        text: ctx.message?.text,
        chatType: ctx.chat?.type
    });
    await next(); // Let commands and other handlers run
});
// /ping for quick health check
bot.command("ping", async (ctx) => {
    try {
        const userId = ctx.from?.id || 'unknown';
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Ping command received from user ${userId}`);
        await ctx.reply("pong ✅");
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Ping response sent successfully`);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Ping failed:`, error);
    }
});
// /help handler - provides guidance before /start
bot.command("help", async (ctx) => {
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
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Help command failed:`, error);
        await ctx.reply("Sorry, something went wrong. Please try again.");
    }
});
// /withdraw command
bot.command("withdraw", async (ctx) => {
    try {
        await startWithdrawFlow(ctx);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Withdraw command failed:`, error);
        await ctx.reply("Sorry, something went wrong. Please try again.");
    }
});
// /start handler
bot.command("start", async (ctx) => {
    try {
        const userId = ctx.from?.id || 'unknown';
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Start command received from user ${userId}`);
        let settings;
        try {
            settings = await getCachedSettings();
        }
        catch (error) {
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
        if (settings.STRIPE_CHECKOUT_URL) {
            kb.row().url('🔗 Pay via Link', settings.STRIPE_CHECKOUT_URL)
                .row().text('🧾 Log External Deposit', 'EXTERNAL_DEPOSIT_LOG');
        }
        await ctx.reply(truncateMessage(MSG.welcome(settings.CLUB_NAME ?? "our club")), {
            reply_markup: kb,
        });
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Start command failed:`, error);
        await ctx.reply("Sorry, something went wrong. Please try again.");
    }
});
// Buy-in start
bot.callbackQuery("BUYIN", async (ctx) => {
    try {
        let settings;
        let owners = [];
        try {
            settings = await getCachedSettings();
            owners = await getCachedOwnerAccounts();
        }
        catch (error) {
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
        const availableMethods = new Set();
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
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Buy-in callback failed:`, error);
        await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
    }
});
// Method chosen
bot.callbackQuery(/METHOD_(.+)/, async (ctx) => {
    try {
        const method = ctx.match?.[1];
        if (!method)
            return;
        const upper = method.toUpperCase();
        // Get settings to check method types
        let settings;
        try {
            settings = await getCachedSettings();
        }
        catch (error) {
            console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to get settings, using env defaults`);
            settings = {
                METHODS_EXTERNAL_LINK: METHODS_EXTERNAL_LINK,
                STRIPE_CHECKOUT_URL: STRIPE_CHECKOUT_URL
            };
        }
        // Check if this is an external link method
        if (settings.METHODS_EXTERNAL_LINK.includes(upper) && settings.STRIPE_CHECKOUT_URL) {
            const kb = new InlineKeyboard()
                .url('Open Checkout', settings.STRIPE_CHECKOUT_URL)
                .row()
                .text('🧾 Log External Deposit', 'EXTERNAL_DEPOSIT_LOG');
            await ctx.editMessageText('Use the link to pay. You can optionally log your payment for records:', { reply_markup: kb });
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
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Method selection failed:`, error);
        await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
    }
});
// Pre-set amounts
bot.callbackQuery(/AMT_(\d+)/, async (ctx) => {
    try {
        // Rate limiting check
        const rateLimit = SecurityValidator.checkRateLimit(ctx.from?.id || 0);
        if (!rateLimit.allowed) {
            await ctx.answerCallbackQuery({
                text: `Rate limit exceeded. Please wait ${Math.ceil((rateLimit.resetTime - Date.now()) / 1000)} seconds.`,
                show_alert: true
            });
            return;
        }
        const validation = SecurityValidator.validateAmount(ctx.match?.[1] || "0");
        if (!validation.valid) {
            logSecurityEvent('INVALID_AMOUNT_CALLBACK', ctx.from?.id, ctx.match?.[1]);
            await ctx.answerCallbackQuery({ text: validation.error, show_alert: true });
            return;
        }
        ctx.session.amount = validation.value;
        await handleAmount(ctx);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Amount selection failed:`, error);
        await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
    }
});
// Custom amount prompt
bot.callbackQuery("AMT_CUSTOM", async (ctx) => {
    try {
        await ctx.editMessageText(`Please enter the amount ($${MIN_BUYIN_AMOUNT}-$${MAX_BUYIN_AMOUNT}):`);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Custom amount prompt failed:`, error);
        await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
    }
});
// Withdrawal button handler
bot.callbackQuery("WITHDRAW", async (ctx) => {
    try {
        await startWithdrawFlow(ctx);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Withdraw button failed:`, error);
        await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
    }
});
// Withdrawal channel selection
bot.callbackQuery("WITHDRAW_START", async (ctx) => {
    try {
        const kb = new InlineKeyboard()
            .text('Venmo', 'WD_CH_VENMO').text('Zelle', 'WD_CH_ZELLE').row()
            .text('PayPal', 'WD_CH_PAYPAL').text('Crypto', 'WD_CH_CRYPTO');
        await ctx.editMessageText('Choose your withdrawal channel:', { reply_markup: kb });
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Withdrawal channel selection failed:`, error);
        await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
    }
});
// Circle withdrawal channels
bot.callbackQuery(/^WD_CH_(VENMO|ZELLE)$/, async (ctx) => {
    try {
        const method = ctx.match?.[1];
        if (!method)
            return;
        ctx.session.payoutType = 'CIRCLE';
        ctx.session.method = method;
        ctx.session.step = "WITHDRAW_AMOUNT";
        await ctx.editMessageText(MSG.withdrawAmountPrompt);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Circle withdrawal channel selection failed:`, error);
        await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
    }
});
// PayPal owner payout
bot.callbackQuery('WD_CH_PAYPAL', async (ctx) => {
    try {
        ctx.session.payoutType = 'OWNER';
        ctx.session.channel = 'PAYPAL';
        ctx.session.step = "WITHDRAW_AMOUNT";
        const ownerHandle = FIXED_WALLETS.PAYPAL || 'Owner';
        await ctx.editMessageText(`PayPal withdrawal will be sent to: ${ownerHandle}\n\n${MSG.withdrawAmountPrompt}`);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] PayPal withdrawal setup failed:`, error);
        await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
    }
});
// Crypto withdrawal
bot.callbackQuery('WD_CH_CRYPTO', async (ctx) => {
    try {
        const coins = ['BTC', 'ETH', 'LTC', 'USDT_ERC20', 'USDT_TRC20', 'XRP', 'SOL'].filter(c => !!FIXED_WALLETS[c]);
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
            if (row.length === 1) {
                kb.text(row[0], `CRYPTO_${row[0]}`);
            }
            else {
                kb.text(row[0], `CRYPTO_${row[0]}`).text(row[1], `CRYPTO_${row[1]}`);
            }
            if (i + 2 < coins.length) {
                kb.row();
            }
        }
        await ctx.editMessageText('Choose your crypto currency:', { reply_markup: kb });
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Crypto withdrawal setup failed:`, error);
        await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
    }
});
// Crypto coin selection
bot.callbackQuery(/^CRYPTO_(.+)$/, async (ctx) => {
    try {
        const coin = ctx.match?.[1];
        if (!coin)
            return;
        ctx.session.cryptoCoin = coin;
        ctx.session.step = "WITHDRAW_AMOUNT";
        const walletAddress = FIXED_WALLETS[coin] || 'Unknown';
        await ctx.editMessageText(`${coin} withdrawal will be sent to: ${walletAddress}\n\n${MSG.withdrawAmountPrompt}`);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Crypto coin selection failed:`, error);
        await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
    }
});
// Withdrawal method selection
bot.callbackQuery(/WITHDRAW_METHOD_(.+)/, async (ctx) => {
    try {
        const method = ctx.match?.[1];
        if (!method)
            return;
        ctx.session.method = method;
        ctx.session.step = "WITHDRAW_AMOUNT";
        await ctx.editMessageText(MSG.withdrawAmountPrompt);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Withdraw method selection failed:`, error);
        await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
    }
});
// Withdrawal submit
bot.callbackQuery("WITHDRAW_SUBMIT", async (ctx) => {
    try {
        await handleWithdrawSubmit(ctx);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Withdraw submit failed:`, error);
        await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
    }
});
// Withdrawal confirmation (loader only)
bot.callbackQuery(/WITHDRAW_CONFIRM_(.+)/, async (ctx) => {
    try {
        await handleWithdrawConfirm(ctx);
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Withdraw confirm failed:`, error);
        await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
    }
});
// Handle text for custom amount and withdrawal
bot.on("message:text", async (ctx) => {
    try {
        if (ctx.session.step === "AMOUNT" && ctx.message?.text) {
            // Rate limiting check
            const rateLimit = SecurityValidator.checkRateLimit(ctx.from?.id || 0);
            if (!rateLimit.allowed) {
                await ctx.reply(`Rate limit exceeded. Please wait ${Math.ceil((rateLimit.resetTime - Date.now()) / 1000)} seconds.`);
                return;
            }
            const validation = SecurityValidator.validateAmount(ctx.message.text);
            if (!validation.valid) {
                logSecurityEvent('INVALID_AMOUNT_INPUT', ctx.from?.id, ctx.message.text);
                await ctx.reply(validation.error);
                return;
            }
            ctx.session.amount = validation.value;
            await handleAmount(ctx);
        }
        else if (ctx.session.step === "WITHDRAW_AMOUNT" && ctx.message?.text) {
            // Rate limiting check
            const rateLimit = SecurityValidator.checkRateLimit(ctx.from?.id || 0);
            if (!rateLimit.allowed) {
                await ctx.reply(`Rate limit exceeded. Please wait ${Math.ceil((rateLimit.resetTime - Date.now()) / 1000)} seconds.`);
                return;
            }
            const validation = SecurityValidator.validateAmount(ctx.message.text);
            if (!validation.valid) {
                logSecurityEvent('INVALID_WITHDRAW_AMOUNT', ctx.from?.id, ctx.message.text);
                await ctx.reply(validation.error);
                return;
            }
            ctx.session.amount = validation.value;
            // Check if this is a circle withdrawal (needs tag) or owner payout (doesn't need tag)
            if (ctx.session.payoutType === 'CIRCLE') {
                ctx.session.step = "WITHDRAW_TAG";
                await ctx.reply(MSG.withdrawTagPrompt);
            }
            else if (ctx.session.payoutType === 'OWNER') {
                // For owner payouts, we need the user's wallet address (for crypto) or just proceed
                if (ctx.session.channel === 'CRYPTO') {
                    ctx.session.step = "CRYPTO_ADDRESS";
                    await ctx.reply('Please enter your wallet address:');
                }
                else {
                    // PayPal doesn't need additional info
                    ctx.session.requestTimestampISO = new Date().toISOString();
                    await showWithdrawSummary(ctx);
                }
            }
        }
        else if (ctx.session.step === "WITHDRAW_TAG" && ctx.message?.text) {
            // Rate limiting check
            const rateLimit = SecurityValidator.checkRateLimit(ctx.from?.id || 0);
            if (!rateLimit.allowed) {
                await ctx.reply(`Rate limit exceeded. Please wait ${Math.ceil((rateLimit.resetTime - Date.now()) / 1000)} seconds.`);
                return;
            }
            const tagValidation = SecurityValidator.validateAndSanitizeTag(ctx.message.text);
            if (!tagValidation.valid) {
                logSecurityEvent('INVALID_TAG_INPUT', ctx.from?.id, ctx.message.text);
                await ctx.reply(tagValidation.error);
                return;
            }
            ctx.session.tag = tagValidation.value;
            ctx.session.requestTimestampISO = new Date().toISOString();
            await showWithdrawSummary(ctx);
        }
        else if (ctx.session.step === "CRYPTO_ADDRESS" && ctx.message?.text) {
            // Rate limiting check
            const rateLimit = SecurityValidator.checkRateLimit(ctx.from?.id || 0);
            if (!rateLimit.allowed) {
                await ctx.reply(`Rate limit exceeded. Please wait ${Math.ceil((rateLimit.resetTime - Date.now()) / 1000)} seconds.`);
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
        }
        else if (ctx.session.step === "EXTERNAL_AMOUNT" && ctx.message?.text) {
            // Rate limiting check
            const rateLimit = SecurityValidator.checkRateLimit(ctx.from?.id || 0);
            if (!rateLimit.allowed) {
                await ctx.reply(`Rate limit exceeded. Please wait ${Math.ceil((rateLimit.resetTime - Date.now()) / 1000)} seconds.`);
                return;
            }
            const validation = SecurityValidator.validateAmount(ctx.message.text);
            if (!validation.valid) {
                logSecurityEvent('INVALID_EXTERNAL_AMOUNT', ctx.from?.id, ctx.message.text);
                await ctx.reply(validation.error);
                return;
            }
            ctx.session.externalAmount = validation.value;
            ctx.session.step = "EXTERNAL_REFERENCE";
            await ctx.reply('Please enter a reference (optional - payment ID, note, etc.):');
        }
        else if (ctx.session.step === "EXTERNAL_REFERENCE" && ctx.message?.text) {
            // Rate limiting check
            const rateLimit = SecurityValidator.checkRateLimit(ctx.from?.id || 0);
            if (!rateLimit.allowed) {
                await ctx.reply(`Rate limit exceeded. Please wait ${Math.ceil((rateLimit.resetTime - Date.now()) / 1000)} seconds.`);
                return;
            }
            ctx.session.externalReference = ctx.message.text;
            // Log the external deposit
            try {
                const entryId = `ext_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                const username = ctx.from?.username ? `@${ctx.from.username}` : `${ctx.from?.first_name || ""} ${ctx.from?.last_name || ""}`.trim();
                // TODO: Implement external deposit logging
                console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] External deposit logged:`, {
                    entry_id: entryId,
                    user_id: ctx.from?.id || 0,
                    username,
                    amount_usd: ctx.session.externalAmount || 0,
                    method: 'EXTERNAL',
                    reference: ctx.session.externalReference,
                    created_at_iso: new Date().toISOString(),
                    recorded_by_user_id: ctx.from?.id || 0
                });
                await ctx.reply(`✅ External deposit logged successfully!\nAmount: $${ctx.session.externalAmount}\nReference: ${ctx.session.externalReference}`);
            }
            catch (error) {
                console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Error logging external deposit:`, error);
                await ctx.reply('Error logging external deposit. Please try again.');
            }
            ctx.session = {}; // Reset session
        }
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Text message handling failed:`, error);
        await ctx.reply("Sorry, something went wrong. Please try again.");
    }
});
async function handleAmount(ctx) {
    try {
        const method = ctx.session.method;
        const amount = ctx.session.amount;
        if (!method || !amount || !ctx.from)
            return;
        const settings = await getCachedSettings();
        const owners = await getCachedOwnerAccounts();
        const match = await findMatch(method, amount, owners, settings.OWNER_FALLBACK_THRESHOLD);
        // Generate unique buy-in ID
        const buyinId = generateBuyinId();
        // Create transaction record
        const transaction = {
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
            await ctx.reply(truncateMessage(MSG.playerMatchedPay(match.amount, settings.CURRENCY, match.method, recv)), { parse_mode: "Markdown" });
        }
        else {
            await ctx.reply(truncateMessage(MSG.playerOwnerPay(amount, settings.CURRENCY, match.method, match.owner?.handle || "<ask owner>", match.owner?.instructions)), { parse_mode: "Markdown" });
        }
        // 2) Post to loader group WITH Mark Paid button
        const groupId = Number(process.env.LOADER_GROUP_ID);
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Loader group ID:`, groupId, 'Is finite:', Number.isFinite(groupId));
        const kb = {
            inline_keyboard: [
                [{ text: "✅ Mark Paid", callback_data: `MARKPAID:${buyinId}:${match.type === "CASHOUT" ? match.request_id || '' : ''}` }]
            ]
        };
        if (Number.isFinite(groupId)) {
            try {
                const text = truncateMessage(MSG.groupCard(playerTag, amount, settings.CURRENCY, match.method, recv));
                console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Posting to group:`, groupId, 'with button:', JSON.stringify(kb));
                const sent = await bot.api.sendMessage(groupId, text, { parse_mode: "Markdown", reply_markup: kb });
                // Store group message info
                transaction.groupMessageId = sent.message_id;
                transaction.groupChatId = sent.chat.id;
                activeTransactions.set(buyinId, transaction);
                console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Successfully posted transaction card to group`);
            }
            catch (error) {
                console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Error posting to loader group:`, error);
                // Fallback: post to private chat with button
                const fallbackText = `🧾 *Transaction Card* (Group posting failed)\n\n` + truncateMessage(MSG.groupCard(playerTag, amount, settings.CURRENCY, match.method, recv));
                await ctx.reply(fallbackText, { parse_mode: "Markdown", reply_markup: kb });
                console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Posted transaction card to private chat as fallback`);
            }
        }
        else {
            console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] No valid LOADER_GROUP_ID found, posting to private chat`);
            // Post to private chat with button if no group ID
            const fallbackText = `🧾 *Transaction Card*\n\n` + truncateMessage(MSG.groupCard(playerTag, amount, settings.CURRENCY, match.method, recv));
            await ctx.reply(fallbackText, { parse_mode: "Markdown", reply_markup: kb });
            console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Posted transaction card to private chat`);
        }
        ctx.session = {}; // reset
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Handle amount failed:`, error);
        await ctx.reply("Sorry, something went wrong. Please try again.");
    }
}
// Restricted Mark Paid handler
bot.callbackQuery(/^MARKPAID:(.+?):(.+)$/, async (ctx) => {
    try {
        const fromId = ctx.from?.id;
        if (!fromId)
            return;
        // Rate limiting check
        const rateLimit = SecurityValidator.checkRateLimit(fromId);
        if (!rateLimit.allowed) {
            await ctx.answerCallbackQuery({
                text: `Rate limit exceeded. Please wait ${Math.ceil((rateLimit.resetTime - Date.now()) / 1000)} seconds.`,
                show_alert: true
            });
            return;
        }
        // Validate callback data
        const callbackData = ctx.callbackQuery?.data || '';
        const validation = SecurityValidator.validateCallbackData(callbackData, /^MARKPAID:(.+?):(.+)$/);
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
        const requestId = ctx.match?.[2]; // Empty string means owner route (no cashout row to mark)
        // Update Google Sheet if a cashout row exists
        const iso = new Date().toISOString();
        if (requestId && requestId.trim() !== '') {
            try {
                await updateWithdrawalStatusById(requestId, 'PAID', `Marked as paid by ${ctx.from?.username ? '@' + ctx.from.username : ctx.from?.first_name || 'Loader'} (${fromId})`);
                // Cache is automatically invalidated by updateWithdrawalStatusById
            }
            catch (e) {
                console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] updateWithdrawalStatusById failed:`, e);
                // Still proceed to update UI to avoid multiple clicks; loaders can fix sheet later
            }
        }
        // Edit the group card message to show confirmation and remove the button
        const verifier = ctx.from?.username ? `@${ctx.from.username}` : `${ctx.from?.first_name || "Loader"} (${fromId})`;
        try {
            await ctx.editMessageText(truncateMessage(MSG.paidConfirmed(verifier, iso)), {
                parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [] }
            });
        }
        catch (e) {
            console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] editMessageText failed:`, e);
        }
        await ctx.answerCallbackQuery({ text: "Marked as paid ✅" });
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Mark paid failed:`, error);
        await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
    }
});
// Group onboarding (safe guard pattern)
bot.on("my_chat_member", async (ctx) => {
    try {
        if (!("my_chat_member" in ctx.update))
            return;
        const upd = ctx.update.my_chat_member;
        if (!upd)
            return; // Type guard for strict TS
        const chatId = upd.chat.id;
        try {
            const welcomeText = `Hi 👋 — type /start here to buy in or type /help for instructions.`;
            // Send and try to pin the welcome message
            try {
                const message = await ctx.api.sendMessage(chatId, welcomeText, { parse_mode: "Markdown" });
                await ctx.api.pinChatMessage(chatId, message.message_id);
            }
            catch (error) {
                console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Could not pin message (bot may not be admin):`, error);
            }
        }
        catch (e) {
            console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] my_chat_member welcome failed:`, e);
        }
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Chat member handling failed:`, error);
    }
});
// First-time user reminder (if privacy hints enabled)
if (PRIVACY_HINTS_ENABLED) {
    bot.on('message', async (ctx, next) => {
        try {
            if (!ctx.from || !ctx.chat || ctx.chat.type === 'private')
                return;
            const groupSession = getGroupSession(ctx.chat.id);
            // Check if this is a first-time user in this group
            if (!groupSession.firstTimeUsers.has(ctx.from.id)) {
                groupSession.firstTimeUsers.add(ctx.from.id);
                // Send gentle reminder
                try {
                    await ctx.reply('Hi 👋 — type /start here to buy in or type /help for instructions.');
                }
                catch (error) {
                    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Error sending first-time reminder:`, error);
                }
            }
        }
        catch (error) {
            console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] First-time user handling failed:`, error);
        }
        await next(); // Important: let other handlers run
    });
}
// Withdrawal functions
async function startWithdrawFlow(ctx) {
    try {
        if (!ctx.from)
            return;
        ctx.session = {}; // Reset session
        ctx.session.step = "WITHDRAW_METHOD";
        // Get available methods from Settings + env fallback
        const { circleMethods, ownerMethods, allMethods } = await getAvailableMethods();
        // Create keyboard with available methods
        const kb = new InlineKeyboard();
        // Add circle methods first (for matching)
        const circleButtons = [];
        for (const method of circleMethods) {
            circleButtons.push({ text: method, callback: `WITHDRAW_METHOD_${method}` });
        }
        // Add owner methods (for owner payouts)
        const ownerButtons = [];
        for (const method of ownerMethods) {
            ownerButtons.push({ text: method, callback: `WITHDRAW_METHOD_${method}` });
        }
        // Combine all buttons
        const allButtons = [...circleButtons, ...ownerButtons];
        // Check if any methods are available
        if (allButtons.length === 0) {
            await ctx.editMessageText("No payment methods are currently available. Please contact the owner to set up payment methods.");
            return;
        }
        // Add methods to keyboard (2 per row)
        for (let i = 0; i < allButtons.length; i += 2) {
            const row = allButtons.slice(i, i + 2);
            if (row.length === 1) {
                kb.text(row[0].text, row[0].callback);
            }
            else {
                kb.text(row[0].text, row[0].callback).text(row[1].text, row[1].callback);
            }
            if (i + 2 < allButtons.length) {
                kb.row();
            }
        }
        await ctx.editMessageText(MSG.withdrawWelcome, { reply_markup: kb });
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Start withdraw flow failed:`, error);
        throw error;
    }
}
async function showWithdrawSummary(ctx) {
    try {
        if (!ctx.from || !ctx.session.method || !ctx.session.amount || !ctx.session.tag) {
            await ctx.reply("Missing withdrawal information. Please start over with /withdraw");
            return;
        }
        const summary = truncateMessage(MSG.withdrawSummary(ctx.session.method, ctx.session.amount, ctx.session.tag));
        const kb = new InlineKeyboard().text("Submit Withdrawal", "WITHDRAW_SUBMIT");
        await ctx.reply(summary, { reply_markup: kb });
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Show withdraw summary failed:`, error);
        throw error;
    }
}
async function handleWithdrawSubmit(ctx) {
    try {
        if (!ctx.from)
            return;
        const { method, amount, tag, requestTimestampISO } = ctx.session;
        if (!amount || !requestTimestampISO) {
            await ctx.answerCallbackQuery({ text: "Missing withdrawal information. Please start over with /withdraw", show_alert: true });
            return;
        }
        // Generate unique request ID
        const requestId = `wd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const username = ctx.from.username ? `@${ctx.from.username}` : `${ctx.from.first_name || ""} ${ctx.from.last_name || ""}`.trim();
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
                    method: method,
                    payment_tag_or_address: tag,
                    request_timestamp_iso: requestTimestampISO,
                    notes: 'Circle withdrawal request'
                });
                await ctx.answerCallbackQuery();
                await ctx.editMessageText(MSG.withdrawSubmitted);
                // Send approval card to loaders group
                const groupId = Number(process.env.LOADER_GROUP_ID);
                if (Number.isFinite(groupId)) {
                    const card = truncateMessage(MSG.withdrawCard(requestId, username, ctx.from.id, method, amount, tag, requestTimestampISO));
                    const kb = {
                        inline_keyboard: [[{ text: "✅ Confirm Withdrawal", callback_data: `WITHDRAW_CONFIRM_${requestId}` }]]
                    };
                    try {
                        await bot.api.sendMessage(groupId, card, {
                            parse_mode: "Markdown",
                            reply_markup: kb
                        });
                    }
                    catch (error) {
                        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Error posting withdrawal request to group:`, error);
                        // Fallback: post to private chat
                        const fallbackText = `🧾 *Withdrawal Request* (Group posting failed)\n\n` + card;
                        await ctx.reply(fallbackText, { parse_mode: "Markdown", reply_markup: kb });
                    }
                }
                else {
                    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] No valid LOADER_GROUP_ID found, posting withdrawal request to private chat`);
                    const card = truncateMessage(MSG.withdrawCard(requestId, username, ctx.from.id, method, amount, tag, requestTimestampISO));
                    const kb = {
                        inline_keyboard: [[{ text: "✅ Mark Paid", callback_data: `WITHDRAW_CONFIRM_${requestId}` }]]
                    };
                    await ctx.reply(card, { parse_mode: "Markdown", reply_markup: kb });
                }
            }
            else {
                // Owner withdrawal - goes to Withdrawals with LOGGED status and Owner Payouts
                if (!method || !tag) {
                    await ctx.answerCallbackQuery({ text: "Missing withdrawal information. Please start over with /withdraw", show_alert: true });
                    return;
                }
                await appendWithdrawalOwner({
                    request_id: requestId,
                    user_id: ctx.from.id,
                    username,
                    amount_usd: amount,
                    method: method,
                    payment_tag_or_address: tag,
                    request_timestamp_iso: requestTimestampISO,
                    notes: 'Owner withdrawal request'
                });
                await ctx.answerCallbackQuery();
                await ctx.editMessageText('Owner withdrawal request submitted successfully.');
                // Send approval card to loaders group
                const groupId = Number(process.env.LOADER_GROUP_ID);
                if (Number.isFinite(groupId)) {
                    const card = `🧾 *Owner Withdrawal Request*\n\nUser: ${username} (${ctx.from.id})\nAmount: $${amount}\nMethod: ${method}\nDestination: ${tag}\n\nRequest ID: ${requestId}`;
                    const kb = {
                        inline_keyboard: [[{ text: "✅ Mark Paid", callback_data: `WITHDRAW_CONFIRM_${requestId}` }]]
                    };
                    try {
                        await bot.api.sendMessage(groupId, card, {
                            parse_mode: "Markdown",
                            reply_markup: kb
                        });
                    }
                    catch (error) {
                        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Error posting owner withdrawal request to group:`, error);
                        // Fallback: post to private chat
                        const fallbackText = `🧾 *Owner Withdrawal Request* (Group posting failed)\n\n` + card;
                        await ctx.reply(fallbackText, { parse_mode: "Markdown", reply_markup: kb });
                    }
                }
            }
        }
        catch (error) {
            console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Error creating withdrawal request:`, error);
            await ctx.answerCallbackQuery({ text: "Error creating withdrawal request. Please try again.", show_alert: true });
        }
        ctx.session = {}; // Reset session
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Handle withdraw submit failed:`, error);
        throw error;
    }
}
async function handleWithdrawConfirm(ctx) {
    try {
        const fromId = ctx.from?.id;
        if (!fromId)
            return;
        // Check if user is authorized
        if (!isAuthorized(fromId)) {
            await ctx.answerCallbackQuery({ text: MSG.notAuthorizedWithdraw, show_alert: true });
            return;
        }
        const requestId = ctx.match?.[1];
        if (!requestId)
            return;
        try {
            // Update withdrawal status to PAID
            await updateWithdrawalStatusById(requestId, 'PAID', `Marked as paid by ${ctx.from?.username ? '@' + ctx.from.username : ctx.from?.first_name || 'Admin'} (${fromId})`);
            // Update the message to show confirmation
            const verifier = ctx.from?.username ? `@${ctx.from.username}` : `${ctx.from?.first_name || "Admin"} (${fromId})`;
            await ctx.editMessageText(`✅ Withdrawal marked as paid by ${verifier} at ${new Date().toISOString()}`, {
                reply_markup: { inline_keyboard: [] }
            });
            await ctx.answerCallbackQuery({ text: "Withdrawal marked as paid ✅" });
        }
        catch (error) {
            console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Error confirming withdrawal:`, error);
            await ctx.answerCallbackQuery({ text: "Error confirming withdrawal. Please try again.", show_alert: true });
        }
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Handle withdraw confirm failed:`, error);
        throw error;
    }
}
// Generate unique withdrawal request ID
function generateWithdrawId() {
    return `wd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}
// External deposit logging
bot.callbackQuery('EXTERNAL_DEPOSIT_LOG', async (ctx) => {
    try {
        ctx.session.step = "EXTERNAL_AMOUNT";
        await ctx.editMessageText('Please enter the amount you paid:');
    }
    catch (error) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] External deposit log setup failed:`, error);
        await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
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
async function getAvailableMethods() {
    try {
        const settings = await getSettings();
        // Get circle methods from settings
        const circleMethods = settings.METHODS_CIRCLE || METHODS_CIRCLE;
        // Get owner methods from settings (owner payment addresses)
        const ownerMethods = [];
        if (settings.APPLE_PAY_HANDLE)
            ownerMethods.push('APPLEPAY');
        if (settings.CASHAPP_HANDLE)
            ownerMethods.push('CASHAPP');
        if (settings.PAYPAL_EMAIL)
            ownerMethods.push('PAYPAL');
        if (settings.CRYPTO_WALLET_BTC)
            ownerMethods.push('BTC');
        if (settings.CRYPTO_WALLET_ETH)
            ownerMethods.push('ETH');
        if (settings.CRYPTO_WALLET) {
            // Add other crypto networks
            const networks = settings.CRYPTO_NETWORKS;
            for (const network of networks) {
                if (network !== 'BTC' && network !== 'ETH') {
                    ownerMethods.push(network);
                }
            }
        }
        // Combine all methods
        const allMethods = [...new Set([...circleMethods, ...ownerMethods])];
        return { circleMethods, ownerMethods, allMethods };
    }
    catch (error) {
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
        }
        catch (error) {
            console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Failed to set webhook:`, error);
        }
    });
}
else {
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Starting bot with long polling mode (development/local)`);
    // Delete any existing webhook first
    try {
        await bot.api.deleteWebhook({ drop_pending_updates: true });
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Deleted existing webhook`);
    }
    catch (error) {
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] No webhook to delete or error:`, error.message);
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
