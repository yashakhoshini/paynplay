import { Bot, session, InlineKeyboard, Context } from "grammy";
import express from "express";
import { webhookCallback } from "grammy";
import { 
  BOT_TOKEN, 
  BASE_URL, 
  PORT,
  LOADER_GROUP_ID,
  BOT_USERNAME,
  PRIVACY_HINTS_ENABLED,
  ALLOWED_USER_IDS,
  MAX_BUYIN_AMOUNT,
  MIN_BUYIN_AMOUNT,
  SESSION_TIMEOUT_MS,
  MAX_MESSAGE_LENGTH,
  CLIENT_NAME,
  CLIENT_ID
} from "./config.js";
import { MSG } from "./messages.js";
import { getSettings, getOwnerAccounts, markRowPaid, createPendingWithdrawal, getPendingWithdrawal, confirmWithdrawal } from "./sheets.js";
import { findMatch } from "./matcher.js";
import { Transaction, GroupSession } from "./types.js";
import { SecurityValidator, logSecurityEvent } from "./security.js";

type SessionData = {
  step?: "METHOD" | "AMOUNT" | "WITHDRAW_METHOD" | "WITHDRAW_AMOUNT" | "WITHDRAW_TAG";
  method?: string;
  amount?: number;
  tag?: string;
  requestTimestampISO?: string;
  lastActivity?: number; // For session timeout
};

interface MyContext extends Context {
  session: SessionData;
}

function initial(): SessionData {
  return { lastActivity: Date.now() };
}

// Store active transactions and group sessions
const activeTransactions = new Map<string, Transaction>();
const groupSessions = new Map<number, GroupSession>();

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
  if (!ALLOWED_USER_IDS || ALLOWED_USER_IDS.length === 0) {
    console.warn(`[${new Date().toISOString()}] [${CLIENT_NAME}] No authorized users configured`);
    return false;
  }
  return ALLOWED_USER_IDS.includes(userId);
}

const bot = new Bot<MyContext>(BOT_TOKEN);

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
bot.on('message', (ctx) => {
  console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Received message:`, {
    from: ctx.from?.id,
    text: ctx.message?.text,
    chatType: ctx.chat?.type
  });
});

// /ping for quick health check
bot.command("ping", async (ctx: MyContext) => {
  try {
    await ctx.reply("pong ✅");
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
    let settings;
    try {
      settings = await getSettings();
    } catch (error) {
      console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Google Sheets not configured, using defaults`);
      // Use default settings when Google Sheets is not configured
      settings = {
        CLUB_NAME: 'Club',
        METHODS_ENABLED: ['ZELLE', 'VENMO', 'CASHAPP', 'PAYPAL'],
        CURRENCY: 'USD',
        FAST_FEE_PCT: 0.02,
        OWNER_FALLBACK_THRESHOLD: 100,
        OWNER_TG_USERNAME: ''
      };
    }
    
    const kb = new InlineKeyboard()
      .text("💸 Buy-In", "BUYIN")
      .row()
      .text("💰 Withdraw", "WITHDRAW");
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
    let settings;
    let owners: any[] = [];
    
    try {
      settings = await getSettings();
      owners = await getOwnerAccounts();
    } catch (error) {
      console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Google Sheets not configured, using defaults`);
      // Use default settings when Google Sheets is not configured
      settings = {
        CLUB_NAME: 'Club',
        METHODS_ENABLED: ['ZELLE', 'VENMO', 'CASHAPP', 'PAYPAL'],
        CURRENCY: 'USD',
        FAST_FEE_PCT: 0.02,
        OWNER_FALLBACK_THRESHOLD: 100,
        OWNER_TG_USERNAME: ''
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
    const method = ctx.match?.[1];
    if (!method) return;
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

// Custom amount prompt
bot.callbackQuery("AMT_CUSTOM", async (ctx: MyContext) => {
  try {
    await ctx.editMessageText(`Please enter the amount ($${MIN_BUYIN_AMOUNT}-$${MAX_BUYIN_AMOUNT}):`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Custom amount prompt failed:`, error);
    await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
  }
});

// Withdrawal button handler
bot.callbackQuery("WITHDRAW", async (ctx: MyContext) => {
  try {
    await startWithdrawFlow(ctx);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Withdraw button failed:`, error);
    await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
  }
});

// Withdrawal method selection
bot.callbackQuery(/WITHDRAW_METHOD_(.+)/, async (ctx: MyContext) => {
  try {
    const method = ctx.match?.[1];
    if (!method) return;
    
    ctx.session.method = method;
    ctx.session.step = "WITHDRAW_AMOUNT";
    
    await ctx.editMessageText(MSG.withdrawAmountPrompt);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Withdraw method selection failed:`, error);
    await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
  }
});

// Withdrawal submit
bot.callbackQuery("WITHDRAW_SUBMIT", async (ctx: MyContext) => {
  try {
    await handleWithdrawSubmit(ctx);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Withdraw submit failed:`, error);
    await ctx.answerCallbackQuery({ text: "Sorry, something went wrong. Please try again.", show_alert: true });
  }
});

// Withdrawal confirmation (loader only)
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
      // Rate limiting check
      const rateLimit = SecurityValidator.checkRateLimit(ctx.from?.id || 0);
      if (!rateLimit.allowed) {
        await ctx.reply(`Rate limit exceeded. Please wait ${Math.ceil((rateLimit.resetTime! - Date.now()) / 1000)} seconds.`);
        return;
      }
      
      const validation = SecurityValidator.validateAmount(ctx.message.text);
      if (!validation.valid) {
        logSecurityEvent('INVALID_AMOUNT_INPUT', ctx.from?.id, ctx.message.text);
        await ctx.reply(validation.error!);
        return;
      }
      ctx.session.amount = validation.value!;
      await handleAmount(ctx);
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
      ctx.session.step = "WITHDRAW_TAG";
      await ctx.reply(MSG.withdrawTagPrompt);
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

    const settings = await getSettings();
    const owners = await getOwnerAccounts();

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
    const groupId = Number(process.env.LOADER_GROUP_ID);
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Loader group ID:`, groupId, 'Is finite:', Number.isFinite(groupId));
    
    const kb = {
      inline_keyboard: [
        [{ text: "✅ Mark Paid", callback_data: `MARKPAID:${buyinId}:${match.type === "CASHOUT" ? match.rowIndex || 0 : 0}` }]
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
bot.callbackQuery(/^MARKPAID:(.+?):(\d+)$/, async (ctx: MyContext) => {
  try {
    const fromId = ctx.from?.id;
    if (!fromId) return;
    
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
    const validation = SecurityValidator.validateCallbackData(callbackData, /^MARKPAID:(.+?):(\d+)$/);
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
    const rowIndex = Number(ctx.match?.[2]); // 0 means owner route (no cashout row to mark)

    // Update Google Sheet if a cashout row exists
    const iso = new Date().toISOString();
    if (rowIndex > 0) {
      try {
        await markRowPaid(rowIndex, fromId, iso);
      } catch (e) {
        console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] markRowPaid failed:`, e);
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
  bot.on('message', async (ctx) => {
    try {
      if (!ctx.from || !ctx.chat || ctx.chat.type === 'private') return;
      
      const groupSession = getGroupSession(ctx.chat.id);
      
      // Check if this is a first-time user in this group
      if (!groupSession.firstTimeUsers.has(ctx.from.id)) {
        groupSession.firstTimeUsers.add(ctx.from.id);
        
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
  });
}

// Withdrawal functions
async function startWithdrawFlow(ctx: MyContext) {
  try {
    if (!ctx.from) return;
    
    ctx.session = {}; // Reset session
    ctx.session.step = "WITHDRAW_METHOD";
    
    // Get owner accounts to see what payment methods are available
    const owners = await getOwnerAccounts();
    
    // Create keyboard with only available owner payment methods
    const kb = new InlineKeyboard();
    const ownerMethods = owners.map(o => o.method);
    
    // Add available methods to keyboard in a clean layout
    const availableMethods = [];
    if (ownerMethods.includes('VENMO')) availableMethods.push({ text: "Venmo", callback: "WITHDRAW_METHOD_VENMO" });
    if (ownerMethods.includes('ZELLE')) availableMethods.push({ text: "Zelle", callback: "WITHDRAW_METHOD_ZELLE" });
    if (ownerMethods.includes('CASHAPP')) availableMethods.push({ text: "Cash App", callback: "WITHDRAW_METHOD_CASHAPP" });
    if (ownerMethods.includes('PAYPAL')) availableMethods.push({ text: "PayPal", callback: "WITHDRAW_METHOD_PAYPAL" });
    
    // Add methods to keyboard (2 per row)
    for (let i = 0; i < availableMethods.length; i += 2) {
      const row = availableMethods.slice(i, i + 2);
      if (row.length === 1) {
        kb.text(row[0].text, row[0].callback);
      } else {
        kb.text(row[0].text, row[0].callback).text(row[1].text, row[1].callback);
      }
      if (i + 2 < availableMethods.length) {
        kb.row();
      }
    }
    
    // Check if any methods are available
    if (availableMethods.length === 0) {
      await ctx.editMessageText("No payment methods are currently available. Please contact the owner to set up payment methods.");
      return;
    }
    
    await ctx.editMessageText(MSG.withdrawWelcome, { reply_markup: kb });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Start withdraw flow failed:`, error);
    throw error;
  }
}

async function showWithdrawSummary(ctx: MyContext) {
  try {
    if (!ctx.from || !ctx.session.method || !ctx.session.amount || !ctx.session.tag) {
      await ctx.reply("Missing withdrawal information. Please start over with /withdraw");
      return;
    }
    
    const summary = truncateMessage(MSG.withdrawSummary(ctx.session.method, ctx.session.amount, ctx.session.tag));
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
    if (!method || !amount || !tag || !requestTimestampISO) {
      await ctx.answerCallbackQuery({ text: "Missing withdrawal information. Please start over with /withdraw", show_alert: true });
      return;
    }
    
    // Generate unique request ID
    const requestId = `wd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    const username = ctx.from.username ? `@${ctx.from.username}` : `${ctx.from.first_name || ""} ${ctx.from.last_name || ""}`.trim();
    
    try {
      // Create pending withdrawal
      await createPendingWithdrawal(
        requestId,
        ctx.from.id,
        username,
        amount,
        method,
        tag,
        requestTimestampISO
      );
      
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
        } catch (error) {
          console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Error posting withdrawal request to group:`, error);
          // Fallback: post to private chat
          const fallbackText = `🧾 *Withdrawal Request* (Group posting failed)\n\n` + card;
          await ctx.reply(fallbackText, { parse_mode: "Markdown", reply_markup: kb });
        }
      } else {
        console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] No valid LOADER_GROUP_ID found, posting withdrawal request to private chat`);
        const card = truncateMessage(MSG.withdrawCard(requestId, username, ctx.from.id, method, amount, tag, requestTimestampISO));
        const kb = {
          inline_keyboard: [[{ text: "✅ Confirm Withdrawal", callback_data: `WITHDRAW_CONFIRM_${requestId}` }]]
        };
        await ctx.reply(card, { parse_mode: "Markdown", reply_markup: kb });
      }
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Error creating withdrawal request:`, error);
      await ctx.answerCallbackQuery({ text: "Error creating withdrawal request. Please try again.", show_alert: true });
    }
    
    ctx.session = {}; // Reset session
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
      // Get pending withdrawal
      const pending = await getPendingWithdrawal(requestId);
      if (!pending) {
        await ctx.answerCallbackQuery({ text: MSG.withdrawNotFound, show_alert: true });
        return;
      }
      
      const [reqId, userId, username, amountUSD, method, tag, requestTimestampISO] = pending.rowValues;
      
      // Confirm withdrawal
      await confirmWithdrawal(
        reqId,
        Number(userId),
        username,
        Number(amountUSD),
        method,
        tag,
        requestTimestampISO,
        fromId
      );
      
      await ctx.answerCallbackQuery(MSG.withdrawConfirmSuccess);
      await ctx.editMessageText(truncateMessage(MSG.withdrawConfirmed(reqId, fromId)));
      
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

const app = express();
app.use(express.json());
app.get("/", (_req, res) => res.send("OK"));

if (BASE_URL) {
  app.use(`/${BOT_TOKEN}`, webhookCallback(bot, "express"));
  app.listen(PORT, async () => {
    const base = BASE_URL.replace(/\/+$/, "");
    const url = `${base}/${BOT_TOKEN}`;
    await bot.api.setWebhook(url);
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Webhook set to ${url}`);
  });
} else {
  app.listen(PORT, () => {
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Server on :${PORT} (long polling)`);
  });
  bot.start();
}
