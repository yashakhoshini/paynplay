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
  ALLOWED_USER_IDS
} from "./config.js";
import { MSG } from "./messages.js";
import { getSettings, getOwnerAccounts, markRowPaid } from "./sheets.js";
import { findMatch } from "./matcher.js";
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

// /help handler - provides guidance before /start
bot.command("help", async (ctx: MyContext) => {
  const helpText = `🎰 **Pay-n-Play Bot Help**

**How to use this bot:**

1️⃣ **Start a buy-in:** Type /start to begin the payment process
2️⃣ **Choose payment method:** Select from available options (Zelle, Venmo, etc.)
3️⃣ **Enter amount:** Specify how much you want to buy in
4️⃣ **Get payment instructions:** The bot will tell you who to pay and how
5️⃣ **Send screenshot:** Post your payment proof in the group chat
6️⃣ **Wait for confirmation:** A loader/owner will verify and mark it paid

**Commands:**
• /start - Begin a new buy-in
• /help - Show this help message
• /ping - Check if bot is working

**Need help?** Contact the group admins or loaders.`;
  
  await ctx.reply(helpText, { parse_mode: "Markdown" });
});

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

  // 1) DM to player: NO button; instruction to send screenshot in group
  const playerTag = ctx.from?.username ? `@${ctx.from.username}` : `${ctx.from?.first_name || "Player"} (${ctx.from?.id})`;
  const recv = match.type === "CASHOUT" ? (match.receiver || "<ask recipient>") : match.owner?.handle || "<ask owner>";

  if (match.type === "CASHOUT") {
    await ctx.reply(
      MSG.playerMatchedPay(match.amount, settings.CURRENCY, match.method, recv),
      { parse_mode: "Markdown" }
    );
  } else {
    await ctx.reply(
      MSG.playerOwnerPay(amount, settings.CURRENCY, match.method, match.owner?.handle || "<ask owner>", match.owner?.instructions),
      { parse_mode: "Markdown" }
    );
  }

  // 2) Post to loader group WITH Mark Paid button
  const groupId = Number(process.env.LOADER_GROUP_ID);
  console.log('Loader group ID:', groupId, 'Is finite:', Number.isFinite(groupId));
  
  const kb = {
    inline_keyboard: [
      [{ text: "✅ Mark Paid", callback_data: `MARKPAID:${buyinId}:${match.type === "CASHOUT" ? match.rowIndex || 0 : 0}` }]
    ]
  };
  
  if (Number.isFinite(groupId)) {
    try {
      const text = MSG.groupCard(playerTag, amount, settings.CURRENCY, match.method, recv);
      console.log('Posting to group:', groupId, 'with button:', JSON.stringify(kb));
      const sent = await bot.api.sendMessage(groupId, text, { parse_mode: "Markdown", reply_markup: kb });

      // Store group message info
      transaction.groupMessageId = sent.message_id;
      transaction.groupChatId = sent.chat.id;
      activeTransactions.set(buyinId, transaction);
      console.log('Successfully posted transaction card to group');

    } catch (error) {
      console.error('Error posting to loader group:', error);
      // Fallback: post to private chat with button
      const fallbackText = `🧾 *Transaction Card* (Group posting failed)\n\n` + MSG.groupCard(playerTag, amount, settings.CURRENCY, match.method, recv);
      await ctx.reply(fallbackText, { parse_mode: "Markdown", reply_markup: kb });
      console.log('Posted transaction card to private chat as fallback');
    }
  } else {
    console.log('No valid LOADER_GROUP_ID found, posting to private chat');
    // Post to private chat with button if no group ID
    const fallbackText = `🧾 *Transaction Card*\n\n` + MSG.groupCard(playerTag, amount, settings.CURRENCY, match.method, recv);
    await ctx.reply(fallbackText, { parse_mode: "Markdown", reply_markup: kb });
    console.log('Posted transaction card to private chat');
  }

  ctx.session = {}; // reset
}

// Restricted Mark Paid handler
bot.callbackQuery(/^MARKPAID:(.+?):(\d+)$/, async (ctx: MyContext) => {
  const fromId = ctx.from?.id;
  
  // Check if user is in the allowed list
  if (!fromId || !ALLOWED_USER_IDS.includes(fromId)) {
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
      console.error("markRowPaid failed:", e);
      // Still proceed to update UI to avoid multiple clicks; loaders can fix sheet later
    }
  }

  // Edit the group card message to show confirmation and remove the button
  const verifier = ctx.from?.username ? `@${ctx.from.username}` : `${ctx.from?.first_name || "Loader"} (${fromId})`;
  try {
    await ctx.editMessageText(MSG.paidConfirmed(verifier, iso), {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [] }
    });
  } catch (e) {
    console.error("editMessageText failed:", e);
  }

  await ctx.answerCallbackQuery({ text: "Marked as paid ✅" });
});

// Group onboarding (safe guard pattern)
bot.on("my_chat_member", async (ctx: MyContext) => {
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
      console.log('Could not pin message (bot may not be admin):', error);
    }
  } catch (e) {
    console.error("my_chat_member welcome failed:", e);
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
        await ctx.reply('Hi 👋 — type /start here to buy in or type /help for instructions.');
      } catch (error) {
        console.error('Error sending first-time reminder:', error);
      }
    }
  });
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
    console.log("Webhook set to", url);
  });
} else {
  app.listen(PORT, () => {
    console.log(`Server on :${PORT} (long polling)`);
  });
  bot.start();
}
