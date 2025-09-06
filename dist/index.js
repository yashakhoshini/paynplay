// app.ts (rewritten)

import { Bot, session, InlineKeyboard } from "grammy";
import express from "express";
import { webhookCallback } from "grammy";

import {
  BOT_TOKEN,
  BASE_URL,
  PORT,
  PRIVACY_HINTS_ENABLED,
  EFFECTIVE_ALLOWED_USER_IDS,
  MAX_BUYIN_AMOUNT,
  MIN_BUYIN_AMOUNT,
  SESSION_TIMEOUT_MS,
  MAX_MESSAGE_LENGTH,
  CLIENT_NAME,
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
  OWNER_TG_USERNAME,
  CONFIG
} from "./config.js";

import { MSG } from "./messages.js";

import {
  getSettings,
  getOwnerAccounts,
  appendWithdrawalCircle,
  appendWithdrawalOwner,
  updateWithdrawalStatusById,
  markOwnerPayoutPaid,
  markStaleCashAppCircleWithdrawals,
  appendWithdrawalRequest,
  setWithdrawalStatus,
  requeueExpiredMatched,
  appendDeposit,
  matchDepositToWithdrawal,
  writeDepositStatus,
  appendLedger
} from "./sheets.js";

import { findMatch, matchDepositToWithdrawalNew } from "./matcher.js";
import { SecurityValidator, logSecurityEvent } from "./security.js";
import { createPendingExternal, setReference, getPending, deletePending } from "./pendingStore.js";

// ===== Loader auth & group ==================================================
const AUTHORIZED_LOADER_IDS = (() => {
  const raw = process.env.LOADER_IDS || process.env.LOADER_ID || "";
  return new Set(
    raw
      .split(",")
      .map((s) => Number(String(s).trim()))
      .filter((n) => Number.isFinite(n))
  );
})();
function isAuthorizedLoader(uid?: number) {
  return process.env.SKIP_ENFORCEMENT === "true" ? true : !!uid && AUTHORIZED_LOADER_IDS.has(uid);
}
function parseGroupIdFromEnv(): number {
  const raw = process.env.LOADER_GROUP_ID || "";
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    const n = Number(p);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}
const LOADER_GROUP_ID = parseGroupIdFromEnv();

// ===== Contact fallback =====================================================
const CONTACT_OWNER = process.env.OWNER_HANDLE || "@owner";
const CONTACT_LOADERS = process.env.LOADER_HANDLES || "@loader1";
const MSG_FALLBACK = `If anything goes wrong, message ${CONTACT_OWNER} or ${CONTACT_LOADERS} with a short description.`;

// ===== Session / caches =====================================================
function initial() {
  return { lastActivity: Date.now() as number };
}
const activeTransactions = new Map<string, any>();
const groupSessions = new Map<number, { firstTimeUsers: Set<number> }>();

const sheetsCache: {
  settings: any | null;
  owners: any[];
  lastUpdated: number;
} = {
  settings: null,
  owners: [],
  lastUpdated: 0
};

const CACHE_TTL = 5 * 60 * 1000;

async function getCachedSettings() {
  const start = Date.now();
  const now = Date.now();
  if (sheetsCache.settings && now - sheetsCache.lastUpdated < CACHE_TTL) {
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Settings from cache (${Date.now() - start}ms)`);
    return sheetsCache.settings;
  }
  try {
    const settings = await getSettings();
    sheetsCache.settings = settings;
    sheetsCache.lastUpdated = now;
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Settings fetched (${Date.now() - start}ms)`);
    return settings;
  } catch {
    const defaults = {
      CLUB_NAME: "Club",
      METHODS_ENABLED: METHODS_ENABLED_DEFAULT,
      CURRENCY: DEFAULT_CURRENCY,
      FAST_FEE_PCT: DEFAULT_FAST_FEE,
      OWNER_FALLBACK_THRESHOLD,
      OWNER_TG_USERNAME
    };
    sheetsCache.settings = defaults;
    sheetsCache.lastUpdated = now;
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Settings defaults (${Date.now() - start}ms)`);
    return defaults;
  }
}

async function getCachedOwnerAccounts() {
  const start = Date.now();
  const now = Date.now();
  if (sheetsCache.owners.length > 0 && now - sheetsCache.lastUpdated < CACHE_TTL) {
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Owners from cache (${Date.now() - start}ms)`);
    return sheetsCache.owners;
  }
  try {
    const owners = await getOwnerAccounts();
    sheetsCache.owners = owners;
    sheetsCache.lastUpdated = now;
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Owners fetched (${Date.now() - start}ms)`);
    return owners;
  } catch {
    const fallback: any[] = [];
    if (VENMO_HANDLE) fallback.push({ method: "VENMO", handle: VENMO_HANDLE, display_name: "Owner", instructions: "Include note with payment" });
    if (ZELLE_HANDLE) fallback.push({ method: "ZELLE", handle: ZELLE_HANDLE, display_name: "Owner", instructions: "Include note with payment" });
    if (CASHAPP_HANDLE) fallback.push({ method: "CASHAPP", handle: CASHAPP_HANDLE, display_name: "Owner", instructions: "Include note with payment" });
    if (PAYPAL_HANDLE) fallback.push({ method: "PAYPAL", handle: PAYPAL_HANDLE, display_name: "Owner", instructions: "Include note with payment" });
    sheetsCache.owners = fallback;
    sheetsCache.lastUpdated = now;
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Owners fallbacks (${Date.now() - start}ms)`);
    return fallback;
  }
}

function getGroupSession(chatId: number) {
  if (!groupSessions.has(chatId)) groupSessions.set(chatId, { firstTimeUsers: new Set() });
  return groupSessions.get(chatId)!;
}

setInterval(() => {
  const now = Date.now();
  const timeout = now - SESSION_TIMEOUT_MS;
  for (const [buyinId, tx] of activeTransactions.entries()) {
    if (tx.timestamp < timeout) {
      activeTransactions.delete(buyinId);
      logSecurityEvent("EXPIRED_TRANSACTION_CLEANUP", tx.playerId, buyinId);
    }
  }
  console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Session cleanup done. Active tx: ${activeTransactions.size}`);
}, 60_000);

setInterval(async () => {
  try {
    await markStaleCashAppCircleWithdrawals(WITHDRAW_STALE_HOURS);
  } catch (e) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Stale sweep failed:`, e);
  }
}, 10 * 60 * 1000);

setInterval(async () => {
  try {
    await getCachedSettings();
    await getCachedOwnerAccounts();
  } catch (e) {
    console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Cache refresh failed:`, e);
  }
}, CACHE_TTL);

// ===== Utilities ============================================================
function generateBuyinId() {
  return `B-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function truncateMessage(message: string, max = MAX_MESSAGE_LENGTH) {
  return message.length <= max ? message : message.slice(0, max - 3) + "...";
}

function isAuthorized(userId?: number) {
  if (!EFFECTIVE_ALLOWED_USER_IDS || EFFECTIVE_ALLOWED_USER_IDS.length === 0) {
    console.warn(`[${new Date().toISOString()}] [${CLIENT_NAME}] No authorized users configured`);
    return false;
  }
  const allowed = EFFECTIVE_ALLOWED_USER_IDS.includes(String(userId));
  if (!allowed) {
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Denied: user ${userId} not in ${EFFECTIVE_ALLOWED_USER_IDS.join(",")}`);
  }
  return allowed;
}

function getLoaderGroupId(): number | null {
  const raw = String(LOADER_GROUP_ID || process.env.LOADER_GROUP_ID || "").trim();
  if (!raw) return null;
  const parts = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  const chosen = parts.find((n) => n < 0) ?? parts[0];
  return Number.isFinite(chosen) ? chosen : null;
}

async function resolvePayToHandle(method: string) {
  const settings = await getCachedSettings();
  const upper = method.toUpperCase();
  const map: Record<string, string | undefined> = {
    VENMO: settings?.VENMO_HANDLE || FIXED_WALLETS.VENMO,
    ZELLE: settings?.ZELLE_HANDLE || FIXED_WALLETS.ZELLE,
    CASHAPP: settings?.CASHAPP_HANDLE || FIXED_WALLETS.CASHAPP,
    APPLE_PAY: settings?.APPLEPAY_HANDLE || (FIXED_WALLETS as any).APPLE_PAY,
    CARD: settings?.CARD_HANDLE || (FIXED_WALLETS as any).CARD
  };
  const handle = map[upper];
  return handle && handle.trim() ? handle : "<ask owner for handle>";
}

// ===== Bot init =============================================================
function initializeBot() {
  if (!BOT_TOKEN) throw new Error("BOT_TOKEN is required");
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(BOT_TOKEN)) throw new Error("BOT_TOKEN format invalid");
  return new Bot(BOT_TOKEN);
}
const bot = initializeBot();

bot.use(async (ctx, next) => {
  if (ctx.callbackQuery) {
    try {
      await ctx.answerCallbackQuery(); // stop spinner ASAP
    } catch {}
  }
  await next();
});

bot.use(
  session({
    initial,
    getSessionKey: (ctx) => (ctx.chat?.type === "private" ? `user:${ctx.from?.id}` : `chat:${ctx.chat?.id}`)
  })
);

bot.use(async (ctx, next) => {
  if (ctx.session) (ctx.session as any).lastActivity = Date.now();
  await next();
});

bot.catch((err) => console.error(`[${new Date().toISOString()}] [${CLIENT_NAME}] Bot error:`, err));

bot.on("message", async (ctx, next) => {
  console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Message`, {
    from: ctx.from?.id,
    text: ctx.message?.text,
    chatType: ctx.chat?.type
  });
  await next();
});

// ===== Commands =============================================================
bot.command("ping", async (ctx) => ctx.reply("pong ✅").catch(() => {}));

bot.command("help", async (ctx) => {
  const helpText = `🎰 Pay-n-Play Bot Help

1️⃣ Start a buy-in: /start
2️⃣ Choose payment method
3️⃣ Pick amount ($${MIN_BUYIN_AMOUNT}–$${MAX_BUYIN_AMOUNT})
4️⃣ Follow instructions, post proof in group
5️⃣ Loader marks paid

Other:
• /withdraw — request withdrawal
• /help — show this

Need help? Contact @Cardinal_J1 @Preshmiles @calmcrafter101`;
  await ctx.reply(truncateMessage(helpText));
});

bot.command("withdraw", async (ctx) => {
  try {
    await startWithdrawFlow(ctx);
  } catch {
    await ctx.reply("Sorry, something went wrong. Please try again.");
  }
});

bot.command("start", async (ctx) => {
  try {
    const settings = await getCachedSettings();
    const kb = new InlineKeyboard().text("💵 Buy-In", "BUYIN").row().text("💸 Withdraw", "WITHDRAW");
    await ctx.reply(truncateMessage(MSG.welcome(settings.CLUB_NAME ?? "our club")), { reply_markup: kb });
  } catch {
    await ctx.reply("Sorry, something went wrong. Please try again.");
  }
});

// ===== Buy-in (start) =======================================================
bot.callbackQuery("BUYIN", async (ctx) => {
  try {
    const settings = await getCachedSettings();
    const owners = await getCachedOwnerAccounts();

    const available = new Set<string>();
    for (const m of settings.METHODS_ENABLED) available.add(m);
    for (const o of owners) available.add(o.method);

    const sorted = Array.from(available).sort();
    if (sorted.length === 0) {
      await ctx.editMessageText("No payment methods available right now. Ping owner/loaders.");
      return;
    }
    (ctx.session as any).step = "METHOD";
    const kb = new InlineKeyboard();
    for (const m of sorted) kb.text(m, `METHOD_${m}`).row();

    await ctx.editMessageText(MSG.selectMethod, { reply_markup: kb });
  } catch (e) {
    console.error("BUYIN failed", e);
    await ctx.answerCallbackQuery({ text: "Error. Try again.", show_alert: true });
  }
});

// ===== Method chosen ========================================================
bot.callbackQuery(/METHOD_(.+)/, async (ctx) => {
  try {
    const method = ctx.match?.[1];
    if (!method) return;
    const upper = method.toUpperCase();

    const settings = await getCachedSettings();
    const isExternal = (settings.METHODS_EXTERNAL_LINK || METHODS_EXTERNAL_LINK).includes(upper) && !!(settings.STRIPE_CHECKOUT_URL || STRIPE_CHECKOUT_URL);

    if (isExternal) {
      // External (Stripe/Card/etc.) — show link AND pre-set amount buttons that go to token flow
      const stripeUrl = settings.STRIPE_CHECKOUT_URL || STRIPE_CHECKOUT_URL || "#";
      const kb = new InlineKeyboard()
        .url("🔗 Pay via Stripe", stripeUrl)
        .row()
        .text("$25", `LOG_CARD:card:25`)
        .text("$50", `LOG_CARD:card:50`)
        .row()
        .text("$75", `LOG_CARD:card:75`)
        .text("$100", `LOG_CARD:card:100`)
        .row()
        .text("$200", `LOG_CARD:card:200`)
        .text("Custom", `LOG_CARD_CUSTOM:card`);

      await ctx.editMessageText(
        `Click the link to pay via ${upper}. After paying, tap a button below to log it. We'll only ask for a *reference*, then a loader will *Mark Paid*.`,
        { reply_markup: kb }
      );
      return;
    }

    // Circle rails → normal amount flow
    (ctx.session as any).method = upper;
    (ctx.session as any).step = "AMOUNT";
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
  } catch (e) {
    console.error("METHOD selection failed", e);
    await ctx.answerCallbackQuery({ text: "Error. Try again.", show_alert: true });
  }
});

// ===== Circle preset amounts ===============================================
bot.callbackQuery(/AMT_(\d+)/, async (ctx) => {
  try {
    const rate = SecurityValidator.checkRateLimit(ctx.from?.id || 0);
    if (!rate.allowed) {
      await ctx.answerCallbackQuery({
        text: `Rate limit exceeded. Wait ${Math.ceil((rate.resetTime - Date.now()) / 1000)}s.`,
        show_alert: true
      });
      return;
    }
    const validation = SecurityValidator.validateAmount(ctx.match?.[1] || "0");
    if (!validation.valid) {
      logSecurityEvent("INVALID_AMOUNT_CALLBACK", ctx.from?.id, ctx.match?.[1]);
      await ctx.answerCallbackQuery({ text: validation.error, show_alert: true });
      return;
    }
    (ctx.session as any).amount = validation.value;
    await handleAmount(ctx);
  } catch (e) {
    console.error("AMT selection failed", e);
    await ctx.answerCallbackQuery({ text: "Error. Try again.", show_alert: true });
  }
});

// ===== Circle custom amount ================================================
bot.callbackQuery("AMT_CUSTOM", async (ctx) => {
  try {
    await ctx.editMessageText(`Please enter the amount ($${MIN_BUYIN_AMOUNT}-${MAX_BUYIN_AMOUNT}):`);
  } catch (e) {
    await ctx.answerCallbackQuery({ text: "Error. Try again.", show_alert: true });
  }
});

// ===== External: custom amount start =======================================
bot.callbackQuery(/^LOG_CARD_CUSTOM:([a-zA-Z0-9_-]+)$/, async (ctx) => {
  try {
    const rail = ctx.match?.[1] || "card";
    (ctx.session as any).awaitCustomRail = rail;
    await ctx.reply(`Enter custom amount for ${rail.toUpperCase()} ($${CONFIG.MIN_BUY_IN}–$${CONFIG.MAX_BUY_IN}):`);
  } catch (e) {
    console.error("LOG_CARD_CUSTOM failed", e);
    await ctx.answerCallbackQuery({ text: "Error. Try again.", show_alert: true });
  }
});

// ===== Buy-in text handling (amounts, withdrawals, external refs) ==========
const pendingDeposits: Record<
  string,
  { amount: number; method: string; userId: number; username: string }
> = {};

bot.on("message:text", async (ctx) => {
  try {
    const text = ctx.message?.text || "";

    // Circle: typed custom amount
    if ((ctx.session as any).step === "AMOUNT") {
      const amt = parseFloat(text.replace(/[^0-9.]/g, "") || "0");
      if (!amt || isNaN(amt)) return void (await ctx.reply("Please enter a valid number."));
      if (amt < MIN_BUYIN_AMOUNT || amt > MAX_BUYIN_AMOUNT) {
        return void (await ctx.reply(`Buy-in must be between $${MIN_BUYIN_AMOUNT} and $${MAX_BUYIN_AMOUNT}.`));
      }
      const method = (ctx.session as any).method?.toUpperCase();
      if (!method) return void (await ctx.reply("Missing payment method. Start again with /start."));
      (ctx.session as any).amount = amt;
      return await handleAmount(ctx);
    }

    // External: custom amount collected
    if ((ctx.session as any).awaitCustomRail && !(ctx.session as any).awaitRef) {
      const amt = Number(text.replace(/[^0-9.]/g, ""));
      if (!amt || amt < CONFIG.MIN_BUY_IN || amt > CONFIG.MAX_BUY_IN) {
        return void (await ctx.reply(`Enter a valid amount (${CONFIG.MIN_BUY_IN}–${CONFIG.MAX_BUY_IN}).`));
      }
      const rail = (ctx.session as any).awaitCustomRail;
      delete (ctx.session as any).awaitCustomRail;
      const { token } = createPendingExternal(String(ctx.from!.id), rail, amt);
      (ctx.session as any).awaitRef = { token };
      return void (await ctx.reply(`Enter reference for ${rail.toUpperCase()} $${amt} (payment ID / note):`));
    }

    // External: awaiting reference → show loader-gated Mark Paid
    if ((ctx.session as any).awaitRef) {
      const token = (ctx.session as any).awaitRef.token;
      const pending = getPending(token);
      if (!pending) {
        (ctx.session as any).awaitRef = undefined;
        return void (await ctx.reply("This log request expired. Start again from the amount buttons."));
      }
      const ref = String(text).trim();
      setReference(token, ref);
      (ctx.session as any).awaitRef = undefined;

      return void (await ctx.reply(
        `Pending ${pending.rail.toUpperCase()} deposit\nAmount: $${pending.amount}\nRef: ${ref}\n\nWaiting for loader approval…`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: "✅ Mark Paid", callback_data: `MP_EXT:${token}` }]]
          }
        }
      ));
    }

    // Withdrawals: amount
    if ((ctx.session as any).step === "WITHDRAW_AMOUNT") {
      const rate = SecurityValidator.checkRateLimit(ctx.from?.id || 0);
      if (!rate.allowed) return void (await ctx.reply(`Rate limit exceeded. Please wait ${Math.ceil((rate.resetTime - Date.now()) / 1000)}s.`));

      const validation = SecurityValidator.validateAmount(text);
      if (!validation.valid) {
        logSecurityEvent("INVALID_WITHDRAW_AMOUNT", ctx.from?.id, text);
        return void (await ctx.reply(validation.error));
      }
      (ctx.session as any).amount = validation.value;

      if ((ctx.session as any).payoutType === "CIRCLE") {
        (ctx.session as any).step = "WITHDRAW_TAG";
        return void (await ctx.reply(MSG.withdrawTagPrompt));
      } else {
        if ((ctx.session as any).channel === "CRYPTO") {
          (ctx.session as any).step = "CRYPTO_ADDRESS";
          return void (await ctx.reply("Please enter your wallet address:"));
        }
        if ((ctx.session as any).channel === "PAYPAL") {
          (ctx.session as any).step = "WITHDRAW_TAG";
          return void (await ctx.reply("Please enter your PayPal email:"));
        }
        (ctx.session as any).requestTimestampISO = new Date().toISOString();
        return void (await showWithdrawSummary(ctx));
      }
    }

    // Withdrawals: tag/email
    if ((ctx.session as any).step === "WITHDRAW_TAG") {
      const rate = SecurityValidator.checkRateLimit(ctx.from?.id || 0);
      if (!rate.allowed) return void (await ctx.reply(`Rate limit exceeded. Please wait ${Math.ceil((rate.resetTime - Date.now()) / 1000)}s.`));

      const tagValidation = SecurityValidator.validateAndSanitizeTag(text);
      if (!tagValidation.valid) {
        logSecurityEvent("INVALID_TAG_INPUT", ctx.from?.id, text);
        return void (await ctx.reply(tagValidation.error));
      }
      (ctx.session as any).tag = tagValidation.value;
      (ctx.session as any).requestTimestampISO = new Date().toISOString();
      return void (await showWithdrawSummary(ctx));
    }

    // Withdrawals: crypto address
    if ((ctx.session as any).step === "CRYPTO_ADDRESS") {
      const rate = SecurityValidator.checkRateLimit(ctx.from?.id || 0);
      if (!rate.allowed) return void (await ctx.reply(`Rate limit exceeded. Please wait ${Math.ceil((rate.resetTime - Date.now()) / 1000)}s.`));
      if (text.length < 10) return void (await ctx.reply("Please enter a valid wallet address."));
      (ctx.session as any).cryptoAddress = text;
      (ctx.session as any).requestTimestampISO = new Date().toISOString();
      return void (await showWithdrawSummary(ctx));
    }
  } catch (e) {
    console.error("message:text handler failed", e);
    await ctx.reply("Sorry, something went wrong. Please try again.");
  }
});

// ===== Create circle buy-in card & group post ==============================
async function handleAmount(ctx: any) {
  try {
    const method = (ctx.session as any).method;
    const amount = (ctx.session as any).amount;
    if (!method || !amount || !ctx.from) return;

    const settings = await getCachedSettings();
    const owners = await getCachedOwnerAccounts();
    const match = await findMatch(method, amount, owners, settings.OWNER_FALLBACK_THRESHOLD);

    const buyinId = generateBuyinId();
    const tx = {
      buyinId,
      playerId: ctx.from.id,
      playerUsername: ctx.from.username,
      playerFirstName: ctx.from.first_name,
      method,
      amount,
      match,
      timestamp: Date.now()
    };
    activeTransactions.set(buyinId, tx);

    const playerTag = ctx.from?.username ? `@${ctx.from.username}` : `${ctx.from?.first_name || "Player"} (${ctx.from?.id})`;
    const recv = match.type === "CASHOUT" ? match.receiver || "<ask recipient>" : match.owner?.handle || "<ask owner>";

    if (match.type === "CASHOUT") {
      await ctx.reply(truncateMessage(MSG.playerMatchedPay(match.amount, settings.CURRENCY, match.method, recv)), { parse_mode: "Markdown" });
    } else {
      await ctx.reply(
        truncateMessage(MSG.playerOwnerPay(amount, settings.CURRENCY, match.method, match.owner?.handle || "<ask owner>", match.owner?.instructions)),
        { parse_mode: "Markdown" }
      );
    }

    const groupId = getLoaderGroupId();
    const callbackRequestId = match.type === "CASHOUT" ? match.request_id || "NONE" : "NONE";
    const kb = { inline_keyboard: [[{ text: "✅ Mark Paid", callback_data: `MARKPAID:${buyinId}:${callbackRequestId}` }]] };

    const card = truncateMessage(MSG.groupCard(playerTag, amount, settings.CURRENCY, match.method, recv));

    if (groupId != null) {
      try {
        const sent = await bot.api.sendMessage(groupId, card, { parse_mode: "Markdown", reply_markup: kb });
        tx.groupMessageId = sent.message_id;
        tx.groupChatId = sent.chat.id;
        activeTransactions.set(buyinId, tx);
      } catch (e) {
        console.error("Group post failed, falling back to DM", e);
        await ctx.reply(`🧾 *Transaction Card* (Group posting failed)\n\n${card}`, { parse_mode: "Markdown", reply_markup: kb });
      }
    } else {
      await ctx.reply(`🧾 *Transaction Card*\n\n${card}`, { parse_mode: "Markdown", reply_markup: kb });
    }

    (ctx.session as any) = {}; // reset
  } catch (e) {
    console.error("handleAmount failed", e);
    await ctx.reply("Sorry, something went wrong. Please try again.");
  }
}

// ===== Restricted MarkPaid for circle buy-ins ===============================
bot.callbackQuery(/^MARKPAID:([^:]+):([^:]*)$/, async (ctx) => {
  try {
    const fromId = ctx.from?.id;
    if (!fromId) return;

    const rate = SecurityValidator.checkRateLimit(fromId);
    if (!rate.allowed) {
      await ctx.answerCallbackQuery({
        text: `Rate limit exceeded. Wait ${Math.ceil((rate.resetTime - Date.now()) / 1000)}s.`,
        show_alert: true
      });
      return;
    }

    const data = ctx.callbackQuery?.data || "";
    const valid = SecurityValidator.validateCallbackData(data, /^MARKPAID:([^:]+):([^:]*)$/);
    if (!valid.valid) {
      logSecurityEvent("INVALID_MARKPAID_CALLBACK", fromId, data);
      await ctx.answerCallbackQuery({ text: "Invalid callback", show_alert: true });
      return;
    }

    if (!isAuthorized(fromId)) {
      logSecurityEvent("UNAUTHORIZED_MARK_PAID_ATTEMPT", fromId, data);
      await ctx.answerCallbackQuery({ text: "Not authorized.", show_alert: true });
      return;
    }

    const buyinId = ctx.match?.[1];
    const requestId = ctx.match?.[2];

    if (requestId && requestId !== "NONE") {
      updateWithdrawalStatusById(requestId, "PAID", `${fromId}`).catch((e) => console.error("updateWithdrawalStatusById failed", e));
    }

    const verifier = ctx.from?.username ? `@${ctx.from.username}` : `${ctx.from?.first_name || "Loader"} (${fromId})`;
    const iso = new Date().toISOString();

    try {
      await ctx.editMessageText(truncateMessage(MSG.paidConfirmed(verifier, iso)), { parse_mode: "Markdown", reply_markup: { inline_keyboard: [] } });
    } catch (e) {
      console.error("editMessageText failed", e);
    }
    await ctx.answerCallbackQuery({ text: "Marked as paid ✅" });
  } catch (e) {
    console.error("MARKPAID failed", e);
    await ctx.answerCallbackQuery({ text: "Error. Try again.", show_alert: true });
  }
});

// ===== External token flow ==================================================
// Pre-set external buttons: LOG_EXTERNAL / LOG_CARD / LOG_STRIPE
bot.callbackQuery(/^(LOG_EXTERNAL|LOG_CARD|LOG_STRIPE):([a-zA-Z0-9_-]+):(\d{1,6})$/, async (ctx) => {
  try {
    const rail = ctx.match?.[2];
    const amount = Number(ctx.match?.[3]);
    if (!rail || isNaN(amount) || amount < CONFIG.MIN_BUY_IN || amount > CONFIG.MAX_BUY_IN) {
      return void (await ctx.reply(`Enter a valid amount (${CONFIG.MIN_BUY_IN}–${CONFIG.MAX_BUY_IN}).`));
    }
    const { token } = createPendingExternal(String(ctx.from?.id), rail, amount);
    (ctx.session as any).awaitRef = { token };
    await ctx.reply(`Enter reference for ${rail.toUpperCase()} $${amount} (payment ID / note):`);
  } catch (e) {
    console.error("LOG_* handler failed", e);
    await ctx.reply("Failed to start external log. Try again.");
  }
});

// Loader-only Mark Paid for external token flow
bot.callbackQuery(/^MP_EXT:([A-Za-z0-9_-]+)$/, async (ctx) => {
  try {
    const fromId = ctx.from?.id;
    if (!isAuthorizedLoader(fromId)) {
      return void (await ctx.answerCallbackQuery({ text: "Not authorized", show_alert: true }));
    }
    const token = ctx.match?.[1];
    if (!token) return;
    const pending = getPending(token);
    if (!pending) {
      return void (await ctx.answerCallbackQuery({ text: "Request expired or not found", show_alert: true }));
    }

    const amount = pending.amount;
    const reference = pending.reference || "";
    const newDepositId = `dep_${Date.now()}`;

    await writeDepositStatus(process.env.SHEET_ID!, newDepositId, "confirmed", Date.now());
    await appendLedger(process.env.SHEET_ID!, [
      [
        new Date().toISOString(),
        "external_deposit_confirmed",
        newDepositId,
        pending.userId,
        pending.rail || "external",
        amount,
        reference
      ]
    ]);

    // Try to match under your queue rules
    await matchDepositToWithdrawalNew(process.env.SHEET_ID!, {
      id: newDepositId,
      userId: pending.userId,
      rail: pending.rail || "external",
      amount,
      status: "confirmed",
      createdAt: Date.now(),
      confirmedAt: Date.now()
    });

    await ctx.editMessageReplyMarkup();
    await ctx.answerCallbackQuery("External deposit logged.");
    await ctx.reply(`External deposit ${newDepositId} confirmed and processed.`);

    deletePending(token);
  } catch (e) {
    console.error("MP_EXT failed", e);
    await ctx.answerCallbackQuery({ text: "Error. Try again.", show_alert: true });
  }
});

// ===== Circle deposit Mark Paid (single, non-conflicting handler) ===========
bot.callbackQuery(/^MARKPAID_DEP:([^:]+):(\d+):(\d+):([^:]+)$/, async (ctx) => {
  try {
    const fromId = ctx.from?.id;
    if (!isAuthorizedLoader(fromId)) {
      await ctx.answerCallbackQuery({ text: "Not authorized", show_alert: true });
      return;
    }
    const [, depId, userIdStr, amountCentsStr, method] = ctx.match!;
    const amount = Number(amountCentsStr) / 100;

    const msgText = ctx.callbackQuery?.message?.text || ctx.callbackQuery?.message?.caption || "";
    const userMatch = msgText.match(/Player:\s*([^\n]+)/);
    const username = userMatch ? userMatch[1] : "";
    const payToMatch = msgText.match(/Pay to:\s*([^\n]+)/);
    const payTo = payToMatch ? payToMatch[1] : await resolvePayToHandle(method);

    await appendDeposit({
      deposit_id: depId,
      user_id: userIdStr,
      username,
      amount_usd: amount,
      method: method,
      pay_to_handle: payTo,
      created_at_iso: new Date().toISOString(),
      status: "PAID",
      notes: `Marked by ${fromId}`
    }).catch(() => {});

    try {
      await ctx.editMessageText((ctx.callbackQuery?.message?.text || "") + "\n\n✅ Paid", { reply_markup: undefined });
    } catch {}

    await ctx.answerCallbackQuery({ text: "Marked ✅" });
  } catch (e) {
    console.error("MARKPAID_DEP failed", e);
    await ctx.answerCallbackQuery({ text: "Failed. Try again.", show_alert: true });
  }
});

// ===== Withdrawals UI & flow ===============================================
bot.callbackQuery("WITHDRAW", async (ctx) => {
  try {
    await startWithdrawFlow(ctx);
  } catch (e) {
    await ctx.answerCallbackQuery({ text: "Error. Try again.", show_alert: true });
  }
});

bot.callbackQuery(/^WD_CH_(VENMO|ZELLE|CASHAPP|APPLE_PAY|CARD)$/, async (ctx) => {
  try {
    const method = ctx.match?.[1];
    if (!method) return;
    (ctx.session as any).payoutType = "CIRCLE";
    (ctx.session as any).method = method;
    (ctx.session as any).step = "WITHDRAW_AMOUNT";
    await ctx.editMessageText(MSG.withdrawAmountPrompt);
  } catch (e) {
    await ctx.answerCallbackQuery({ text: "Error. Try again.", show_alert: true });
  }
});

bot.callbackQuery("WD_CH_PAYPAL", async (ctx) => {
  try {
    (ctx.session as any).payoutType = "OWNER";
    (ctx.session as any).channel = "PAYPAL";
    (ctx.session as any).step = "WITHDRAW_AMOUNT";
    await ctx.editMessageText(`You chose PayPal withdrawal.\n\n${MSG.withdrawAmountPrompt}`);
  } catch (e) {
    await ctx.answerCallbackQuery({ text: "Error. Try again.", show_alert: true });
  }
});

bot.callbackQuery("WD_CH_CRYPTO", async (ctx) => {
  try {
    const coins = ["BTC", "ETH", "LTC", "USDT_ERC20", "USDT_TRC20", "XRP", "SOL"].filter((c) => !!(FIXED_WALLETS as any)[c]);
    if (coins.length === 0) return void (await ctx.editMessageText("No crypto wallets configured. Contact support."));
    (ctx.session as any).payoutType = "OWNER";
    (ctx.session as any).channel = "CRYPTO";
    (ctx.session as any).step = "CRYPTO_COIN";
    const kb = new InlineKeyboard();
    for (let i = 0; i < coins.length; i += 2) {
      const row = coins.slice(i, i + 2);
      if (row.length === 1) kb.text(row[0], `CRYPTO_${row[0]}`);
      else kb.text(row[0], `CRYPTO_${row[0]}`).text(row[1], `CRYPTO_${row[1]}`);
      if (i + 2 < coins.length) kb.row();
    }
    await ctx.editMessageText("Choose your crypto currency:", { reply_markup: kb });
  } catch (e) {
    await ctx.answerCallbackQuery({ text: "Error. Try again.", show_alert: true });
  }
});

bot.callbackQuery(/^CRYPTO_(.+)$/, async (ctx) => {
  try {
    const coin = ctx.match?.[1];
    if (!coin) return;
    (ctx.session as any).cryptoCoin = coin;
    (ctx.session as any).step = "WITHDRAW_AMOUNT";
    const wallet = (FIXED_WALLETS as any)[coin] || "Unknown";
    await ctx.editMessageText(`${coin} withdrawal will be sent to: ${wallet}\n\n${MSG.withdrawAmountPrompt}`);
  } catch (e) {
    await ctx.answerCallbackQuery({ text: "Error. Try again.", show_alert: true });
  }
});

bot.callbackQuery(/WITHDRAW_METHOD_(.+)/, async (ctx) => {
  try {
    const method = ctx.match?.[1];
    if (!method) return;
    const settings = await getCachedSettings();
    const upper = method.toUpperCase();
    (ctx.session as any).method = upper;
    if ((settings.METHODS_CIRCLE || METHODS_CIRCLE).includes(upper)) {
      (ctx.session as any).payoutType = "CIRCLE";
      (ctx.session as any).step = "WITHDRAW_AMOUNT";
      await ctx.editMessageText(MSG.withdrawAmountPrompt);
    } else if (upper === "PAYPAL") {
      (ctx.session as any).payoutType = "OWNER";
      (ctx.session as any).channel = "PAYPAL";
      (ctx.session as any).step = "WITHDRAW_AMOUNT";
      await ctx.editMessageText(MSG.withdrawAmountPrompt);
    } else if (upper === "CRYPTO") {
      (ctx.session as any).payoutType = "OWNER";
      (ctx.session as any).channel = "CRYPTO";
      (ctx.session as any).step = "CRYPTO_COIN";
      const coins = ["BTC", "ETH", "LTC", "USDT_ERC20", "USDT_TRC20", "XRP", "SOL"].filter((c) => !!(FIXED_WALLETS as any)[c]);
      const kb = new InlineKeyboard();
      for (let i = 0; i < coins.length; i += 2) {
        const row = coins.slice(i, i + 2);
        if (row.length === 1) kb.text(row[0], `CRYPTO_${row[0]}`);
        else kb.text(row[0], `CRYPTO_${row[0]}`).text(row[1], `CRYPTO_${row[1]}`);
        if (i + 2 < coins.length) kb.row();
      }
      await ctx.editMessageText("Choose your crypto currency:", { reply_markup: kb });
    } else {
      (ctx.session as any).payoutType = "OWNER";
      (ctx.session as any).channel = upper;
      (ctx.session as any).step = "WITHDRAW_AMOUNT";
      await ctx.editMessageText(MSG.withdrawAmountPrompt);
    }
  } catch (e) {
    await ctx.answerCallbackQuery({ text: "Error. Try again.", show_alert: true });
  }
});

bot.callbackQuery("WITHDRAW_SUBMIT", async (ctx) => {
  try {
    if (!ctx.from) return;
    const { payoutType, channel, method, amount, tag, cryptoAddress } = ctx.session as any;
    const requestTimestampISO = (ctx.session as any).requestTimestampISO || new Date().toISOString();
    if (!method || !amount) {
      return void (await ctx.answerCallbackQuery({ text: "Missing info. Start over with /withdraw", show_alert: true }));
    }
    const dest = payoutType === "CIRCLE" ? tag : channel === "CRYPTO" ? cryptoAddress : tag;
    if (!dest) return void (await ctx.answerCallbackQuery({ text: "Destination missing.", show_alert: true }));

    const requestId = `wd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const username = ctx.from.username ? `@${ctx.from.username}` : `${ctx.from.first_name || ""} ${ctx.from.last_name || ""}`.trim();

    const text = [
      "*Withdrawal Request*",
      `ID: ${requestId}`,
      `Player: ${username} (${ctx.from.id})`,
      `Amount: $${Number(amount).toFixed(2)}`,
      `Method: ${method}`,
      `Destination: ${dest}`,
      `Type: ${payoutType}`,
      `Requested: ${requestTimestampISO}`
    ].join("\n");

    const kb = new InlineKeyboard()
      .text("✅ Approve", `APPROVE_WD:${requestId}:${ctx.from.id}:${Math.round(Number(amount) * 100)}:${method}:${payoutType}`)
      .text("❌ Reject", `REJECT_WD:${requestId}`);

    if (Number.isFinite(LOADER_GROUP_ID)) {
      await bot.api.sendMessage(LOADER_GROUP_ID as any, text, { parse_mode: "Markdown", reply_markup: kb });
    } else {
      console.error("LOADER_GROUP_ID missing/invalid");
    }
    await ctx.reply(`Submitted to loaders. You'll be queued after approval.\n${MSG_FALLBACK}`);
  } catch (e) {
    console.error("WITHDRAW_SUBMIT failed", e);
    await ctx.answerCallbackQuery({ text: "Error. Try again.", show_alert: true });
  }
});

bot.callbackQuery(/^APPROVE_WD:(.+):(\d+):(\d+):([^:]+):(CIRCLE|OWNER)$/, async (ctx) => {
  try {
    const fromId = ctx.from?.id;
    if (!isAuthorizedLoader(fromId)) return void (await ctx.answerCallbackQuery({ text: "Not authorized", show_alert: true }));

    const [, requestId, userIdStr, amountCentsStr, method, payoutType] = ctx.match!;
    const amount = Number(amountCentsStr) / 100;

    const messageText = ctx.callbackQuery?.message?.text || ctx.callbackQuery?.message?.caption || "";
    const destMatch = messageText.match(/Destination:\s*(.+)/);
    const destination = destMatch ? destMatch[1] : "";
    const usernameMatch = messageText.match(/Player:\s*([^\n]+)/);
    const username = usernameMatch ? usernameMatch[1] : "";

    await appendWithdrawalRequest({
      request_id: requestId,
      user_id: userIdStr,
      username,
      amount_usd: amount,
      method,
      payment_tag_or_address: destination,
      request_timestamp_iso: new Date().toISOString(),
      status: "QUEUED",
      payout_type: payoutType,
      notes: `approved_by:${fromId}`
    });

    const kb = new InlineKeyboard().text("🤝 Match (30m)", `MATCH_WD:${requestId}`).text("✅ Mark Paid", `PAID_WD:${requestId}`);
    const text = (ctx.callbackQuery?.message?.text || "") + "\n\nApproved and queued.";
    await ctx.editMessageText(text, { reply_markup: kb });
  } catch (e) {
    console.error("APPROVE_WD failed", e);
    await ctx.answerCallbackQuery({ text: "Approval failed", show_alert: true });
  }
});

bot.callbackQuery(/^REJECT_WD:(.+)$/, async (ctx) => {
  try {
    if (!isAuthorizedLoader(ctx.from?.id)) return void (await ctx.answerCallbackQuery({ text: "Not authorized", show_alert: true }));
    const text = (ctx.callbackQuery?.message?.text || "") + "\n\nRejected.";
    await ctx.editMessageText(text);
  } catch {}
});

bot.callbackQuery(/^MATCH_WD:(.+)$/, async (ctx) => {
  try {
    if (!isAuthorizedLoader(ctx.from?.id)) return void (await ctx.answerCallbackQuery({ text: "Not authorized", show_alert: true }));
    const requestId = ctx.match?.[1]!;
    const due = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await setWithdrawalStatus(requestId, "MATCHED", { matchedDueAtISO: due, notesAppend: `matched_by:${ctx.from?.id}` });
    const text = (ctx.callbackQuery?.message?.text || "") + `\n\nMatched. Due by ${due}`;
    const kb = new InlineKeyboard().text("✅ Mark Paid", `PAID_WD:${requestId}`);
    await ctx.editMessageText(text, { reply_markup: kb });
  } catch (e) {
    console.error("MATCH_WD failed", e);
  }
});

bot.callbackQuery(/^PAID_WD:(.+)$/, async (ctx) => {
  try {
    if (!isAuthorizedLoader(ctx.from?.id)) return void (await ctx.answerCallbackQuery({ text: "Not authorized", show_alert: true }));
    const requestId = ctx.match?.[1]!;
    await setWithdrawalStatus(requestId, "PAID", { notesAppend: `paid_by:${ctx.from?.id}` });
    const text = (ctx.callbackQuery?.message?.text || "") + "\n\n✅ Paid";
    await ctx.editMessageText(text, { reply_markup: undefined });
  } catch (e) {
    console.error("PAID_WD failed", e);
  }
});

// ===== Group onboarding & privacy hints ====================================
bot.on("my_chat_member", async (ctx) => {
  try {
    const upd: any = (ctx.update as any).my_chat_member;
    if (!upd) return;
    const chatId = upd.chat.id;
    try {
      const welcomeText = `Hi 👋 — type /start here to buy in or type /help for instructions.`;
      const message = await ctx.api.sendMessage(chatId, welcomeText, { parse_mode: "Markdown" });
      try {
        await ctx.api.pinChatMessage(chatId, message.message_id);
      } catch (e) {
        console.log("Could not pin (bot may not be admin):", e);
      }
    } catch (e) {
      console.error("my_chat_member welcome failed:", e);
    }
  } catch (e) {
    console.error("Chat member handling failed:", e);
  }
});

if (PRIVACY_HINTS_ENABLED) {
  bot.on("message", async (ctx, next) => {
    try {
      if (!ctx.from || !ctx.chat || ctx.chat.type === "private") return;
      const gs = getGroupSession(ctx.chat.id);
      if (!gs.firstTimeUsers.has(ctx.from.id)) {
        gs.firstTimeUsers.add(ctx.from.id);
        try {
          await ctx.reply("Hi 👋 — type /start here to buy in or type /help for instructions.");
        } catch (e) {
          console.error("First-time reminder failed:", e);
        }
      }
    } catch (e) {
      console.error("First-time user handling failed:", e);
    }
    await next();
  });
}

// ===== Withdraw helpers =====================================================
async function startWithdrawFlow(ctx: any) {
  (ctx.session as any) = {};
  const kb = new InlineKeyboard().text("Venmo", "WD_CH_VENMO").text("Zelle", "WD_CH_ZELLE").row().text("CashApp", "WD_CH_CASHAPP");

  const s = await getCachedSettings().catch(() => null as any);
  const wantCard = !!(s?.METHODS_CIRCLE?.includes("CARD") || (FIXED_WALLETS as any).CARD);
  const wantApple = !!(s?.METHODS_CIRCLE?.includes("APPLE_PAY") || (FIXED_WALLETS as any).APPLE_PAY);
  if (wantApple || wantCard) kb.row();
  if (wantApple) kb.text("Apple Pay", "WD_CH_APPLE_PAY");
  if (wantCard) kb.text("Card", "WD_CH_CARD");
  kb.row().text("PayPal", "WD_CH_PAYPAL").text("Crypto", "WD_CH_CRYPTO");

  await ctx.editMessageText(MSG.withdrawWelcome + `\n\n${MSG_FALLBACK}`, { reply_markup: kb });
}

async function showWithdrawSummary(ctx: any) {
  const { payoutType, channel, method, amount, tag, cryptoAddress } = ctx.session as any;
  if (!method || !amount) return void (await ctx.reply("Missing withdrawal info. Start over with /withdraw"));

  let destination: string | undefined;
  if (payoutType === "CIRCLE") {
    if (!tag) return void (await ctx.reply("Provide your handle/phone to receive funds."));
    destination = tag;
  } else if (channel === "CRYPTO") {
    if (!cryptoAddress) return void (await ctx.reply("Provide your wallet address."));
    destination = cryptoAddress;
  } else if (channel === "PAYPAL") {
    if (!tag) return void (await ctx.reply("Provide your PayPal email."));
    destination = tag;
  } else {
    if (!tag) return void (await ctx.reply("Provide your payout destination."));
    destination = tag;
  }

  const summary = truncateMessage(
    `Review your withdrawal:
• Method: ${method}
• Amount: $${Number(amount).toFixed(2)}
• Destination: ${destination}

Tap "Submit Withdrawal" to send to loaders for approval.

${MSG_FALLBACK}`
  );
  const kb = new InlineKeyboard().text("Submit Withdrawal", "WITHDRAW_SUBMIT");
  await ctx.reply(summary, { reply_markup: kb });
}

// ===== Server / webhook =====================================================
const app = express();
app.use(express.json());
app.get("/", (_req, res) => res.send("OK"));
app.get("/health", (_req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    client: CLIENT_NAME,
    botToken: BOT_TOKEN ? "SET" : "MISSING",
    baseUrl: BASE_URL || "NOT_SET"
  });
});

const isDevelopment = process.env.NODE_ENV === "development" || !BASE_URL;

if (BASE_URL && !isDevelopment) {
  console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Webhook mode`);
  app.use(`/${BOT_TOKEN}`, (req, _res, next) => {
    console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Webhook:`, {
      method: req.method,
      url: req.url,
      body: req.body,
      headers: req.headers
    });
    next();
  });
  const handler = webhookCallback(bot, "express");
  app.use(`/${BOT_TOKEN}`, handler);
  app.listen(PORT, async () => {
    try {
      const base = BASE_URL.replace(/\/+$/, "");
      const url = `${base}/${BOT_TOKEN}`;
      await bot.api.setWebhook(url);
      console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Webhook set to ${url}`);
      const info = await bot.api.getWebhookInfo();
      console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Webhook info:`, info);
    } catch (e) {
      console.error("Failed to set webhook:", e);
    }
  });
} else {
  console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Polling mode`);
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: true });
  } catch (e: any) {
    console.log("deleteWebhook:", e?.message);
  }
  app.listen(PORT, () => console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] Server on :${PORT} (polling)`));
  bot.start({
    drop_pending_updates: true,
    onStart: () => console.log(`[${new Date().toISOString()}] [${CLIENT_NAME}] ✅ Bot started (polling)`)
  });
}
