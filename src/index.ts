import { Bot, session, InlineKeyboard, Context } from "grammy";
import express from "express";
import { webhookCallback } from "grammy";
import { 
  BOT_TOKEN, 
  BASE_URL, 
  PORT,
  LOADER_GROUP_ID,
  BOT_USERNAME,
  PRIVACY_HINTS_ENABLED
} from "./config.js";
import { MSG } from "./messages.js";
import { getSettings, getOwnerAccounts, markBuyinPaid } from "./sheets.js";
import { findMatch } from "./matcher.js";
import { isPrivileged } from "./roles.js";
import { Transaction, GroupSession } from "./types.js";

type SessionData = {
  step?: "METHOD" | "AMOUNT";
  method?: string;
  amount?: number;
};

interface MyContext extends Context {
  session: SessionData;
}

function initial(): SessionData {
  return {};
}

// Store active transactions and group sessions
const activeTransactions = new Map<string, Transaction>();
const groupSessions = new Map<number, GroupSession>();

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

const bot = new Bot<MyContext>(BOT_TOKEN);
bot.use(session({ initial }));

// /ping for quick health check
bot.command("ping", async (ctx: MyContext) => ctx.reply("pong ✅"));

// /start handler
bot.command("start", async (ctx: MyContext) => {
  const settings = await getSettings();
  const kb = new InlineKeyboard().text("💸 Buy-In", "BUYIN");
  await ctx.reply(MSG.welcome(settings.CLUB_NAME ?? "our club"), {
    reply_markup: kb,
  });
});

// Buy-in start
bot.callbackQuery("BUYIN", async (ctx: MyContext) => {
  const settings = await getSettings();
  ctx.session.step = "METHOD";
  const kb = new InlineKeyboard();
  for (const m of settings.METHODS_ENABLED) {
    kb.text(m, `METHOD_${m}`).row();
  }
  await ctx.editMessageText(MSG.selectMethod, { reply_markup: kb });
});

// Method chosen
bot.callbackQuery(/METHOD_(.+)/, async (ctx: MyContext) => {
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
});

// Pre-set amounts
bot.callbackQuery(/AMT_(\d+)/, async (ctx: MyContext) => {
  const amount = parseInt(ctx.match?.[1] || "0", 10);
  ctx.session.amount = amount;
  await handleAmount(ctx);
});

// Custom amount prompt
bot.callbackQuery("AMT_CUSTOM", async (ctx: MyContext) => {
  await ctx.editMessageText(MSG.enterAmount);
});

// Handle text for custom amount
bot.on("message:text", async (ctx: MyContext) => {
  if (ctx.session.step === "AMOUNT" && ctx.message?.text) {
    const amt = parseFloat(ctx.message.text.trim());
    if (isNaN(amt) || amt <= 0) {
      await ctx.reply(MSG.invalidAmount);
      return;
    }
    ctx.session.amount = amt;
    await handleAmount(ctx);
  }
});

async function handleAmount(ctx: MyContext) {
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

  // Reply to player in DM
  if (match.type === 'CASHOUT') {
    await ctx.reply(
      MSG.matchedPay(amount, settings.CURRENCY, method, match.cashout.receiver_handle),
      { parse_mode: "Markdown" }
    );
  } else {
    await ctx.reply(
      MSG.ownerPay(amount, settings.CURRENCY, method, match.owner.handle, match.owner.instructions),
      { parse_mode: "Markdown" }
    );
  }

  // Post transaction card to loader group
  if (LOADER_GROUP_ID) {
    try {
      const playerName = ctx.from.username 
        ? `@${ctx.from.username}` 
        : `${ctx.from.first_name || 'Unknown'} (ID: ${ctx.from.id})`;
      
      const payeeHandle = match.type === 'CASHOUT' 
        ? match.cashout.receiver_handle || '<ask recipient>'
        : match.owner.handle;

      const cardText = MSG.transactionCard(
        playerName,
        amount,
        settings.CURRENCY,
        method,
        payeeHandle
      );

      const kb = new InlineKeyboard()
        .text(MSG.markPaid, `MARKPAID:${buyinId}`)
        .row()
        .url(MSG.viewSheet, `https://docs.google.com/spreadsheets/d/${process.env.SHEET_ID}/edit`);

      const groupMessage = await bot.api.sendMessage(
        LOADER_GROUP_ID,
        cardText,
        { 
          parse_mode: "Markdown",
          reply_markup: kb
        }
      );

      // Store group message info
      transaction.groupMessageId = groupMessage.message_id;
      transaction.groupChatId = groupMessage.chat.id;
      activeTransactions.set(buyinId, transaction);

    } catch (error) {
      console.error('Error posting to loader group:', error);
      await ctx.reply('Warning: Could not post to loader group. Please contact support.');
    }
  }

  ctx.session = {}; // reset
}

// Mark Paid with authorization check
bot.callbackQuery(/^MARKPAID:(.+)$/, async (ctx: MyContext) => {
  const buyinId = ctx.match?.[1];
  if (!buyinId || !ctx.from) return;

  const transaction = activeTransactions.get(buyinId);
  if (!transaction) {
    await ctx.answerCallbackQuery({ text: "Transaction not found or expired." });
    return;
  }

  // Check if user is privileged
  const privileged = await isPrivileged(ctx.from.id);
  if (!privileged) {
    await ctx.answerCallbackQuery({ 
      show_alert: true, 
      text: MSG.notAuthorized 
    });
    return;
  }

  try {
    // Update the sheet
    await markBuyinPaid(buyinId, ctx.from.id);

    // Update the group message
    const verifierName = ctx.from.username || ctx.from.first_name || `User${ctx.from.id}`;
    const updatedText = `${transaction.groupMessageId ? 'Original message updated' : 'Transaction'} - ${MSG.paidConfirmed(verifierName, new Date().toISOString())}`;
    
    // Remove the button by editing the message
    if (transaction.groupMessageId && transaction.groupChatId) {
      try {
        await bot.api.editMessageText(
          transaction.groupChatId,
          transaction.groupMessageId,
          updatedText,
          { parse_mode: "Markdown" }
        );
      } catch (error) {
        console.error('Failed to update group message:', error);
      }
    }

    await ctx.answerCallbackQuery({ text: "Payment confirmed! ✅" });
    
    // Clean up transaction
    activeTransactions.delete(buyinId);

  } catch (error) {
    console.error('Error marking payment:', error);
    await ctx.answerCallbackQuery({ 
      show_alert: true, 
      text: "Error confirming payment. Please try again." 
    });
  }
});

// Group welcome message when bot is added
bot.on('my_chat_member', async (ctx: MyContext) => {
  const upd = ctx.update.my_chat_member;
  if (!upd) return; // type guard for strict TS

  if (upd.new_chat_member.status === 'member' || 
      upd.new_chat_member.status === 'administrator') {
    
    const welcomeText = MSG.groupWelcome(BOT_USERNAME);
    
    try {
      const message = await ctx.reply(welcomeText, { parse_mode: "Markdown" });
      
      // Try to pin the message if bot is admin
      if (upd.new_chat_member.status === 'administrator') {
        try {
          await bot.api.pinChatMessage(upd.chat.id, message.message_id);
        } catch (error) {
          console.log('Could not pin message:', error);
        }
      } else {
        await ctx.reply(MSG.adminPinRequest);
      }
    } catch (error) {
      console.error('Error posting group welcome:', error);
    }
  }
});

// First-time user reminder (if privacy hints enabled)
if (PRIVACY_HINTS_ENABLED) {
  bot.on('message', async (ctx) => {
    if (!ctx.from || !ctx.chat || ctx.chat.type === 'private') return;
    
    const groupSession = getGroupSession(ctx.chat.id);
    
    // Check if this is a first-time user in this group
    if (!groupSession.firstTimeUsers.has(ctx.from.id)) {
      groupSession.firstTimeUsers.add(ctx.from.id);
      
      // Send gentle reminder
      try {
        await ctx.reply(MSG.reminderFirstTime(BOT_USERNAME));
      } catch (error) {
        console.error('Error sending first-time reminder:', error);
      }
    }
  });
}

const app = express();
app.use(express.json()); // before mounting webhook
app.get("/", (_, res) => res.send("OK"));

if (BASE_URL) {
  // Add error handling for webhook
  app.use(`/${BOT_TOKEN}`, (req, res, next) => {
    console.log('Webhook received:', req.method, req.url);
    next();
  });
  
  app.use(`/${BOT_TOKEN}`, webhookCallback(bot as any, "express"));
  
  app.listen(PORT, async () => {
    console.log(`Server on :${PORT}`);
    try {
      const base = BASE_URL.replace(/\/+$/, ""); // strip trailing slashes
      const webhookUrl = `${base}/${BOT_TOKEN}`;
      await bot.api.setWebhook(webhookUrl);
      console.log(`Webhook set to ${webhookUrl}`);
    } catch (error) {
      console.error('Failed to set webhook:', error);
    }
  });
} else {
  app.listen(PORT, () => {
    console.log(`Server on :${PORT} (long polling)`);
  });
  bot.start();
}
