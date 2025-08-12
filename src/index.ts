import { Bot, session, InlineKeyboard, Context } from "grammy";
import express from "express";
import { webhookCallback } from "grammy";
import { 
  BOT_TOKEN, 
  BASE_URL, 
  PORT 
} from "./config.js";
import { MSG } from "./messages.js";
import { getSettings, getOwnerAccounts } from "./sheets.js";
import { findMatch } from "./matcher.js";

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
  if (!method || !amount) return;

  const settings = await getSettings();
  const owners = await getOwnerAccounts();

  const match = await findMatch(method, amount, owners, settings.OWNER_FALLBACK_THRESHOLD);

  if (match.type === 'CASHOUT') {
    const kb = new InlineKeyboard().text(MSG.markPaid, "MARKPAID");
    await ctx.reply(
      MSG.matchedPay(amount, settings.CURRENCY, method, match.cashout.receiver_handle),
      { parse_mode: "Markdown", reply_markup: kb }
    );
  } else {
    const kb = new InlineKeyboard().text(MSG.markPaid, "MARKPAID");
    await ctx.reply(
      MSG.ownerPay(amount, settings.CURRENCY, method, match.owner.handle, match.owner.instructions),
      { parse_mode: "Markdown", reply_markup: kb }
    );
  }

  ctx.session = {}; // reset
}

// Mark Paid placeholder
bot.callbackQuery("MARKPAID", async (ctx: MyContext) => {
  await ctx.answerCallbackQuery({ text: "Marked as paid ✅" });
});

const app = express();
app.get("/", (_, res) => res.send("OK"));

if (BASE_URL) {
  app.use(`/`, webhookCallback(bot as any, "express"));
  app.listen(PORT, async () => {
    console.log(`Server on :${PORT}`);
    await bot.api.setWebhook(`${BASE_URL}/`);
    console.log(`Webhook set to ${BASE_URL}/`);
  });
} else {
  app.listen(PORT, () => {
    console.log(`Server on :${PORT} (long polling)`);
  });
  bot.start();
}
