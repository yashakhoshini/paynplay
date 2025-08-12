import { Bot, Context, InlineKeyboard, session, SessionFlavor, webhookCallback } from "grammy";
import express from "express";
import { BOT_TOKEN, BASE_URL, PORT } from "./config.js";
import type { Method } from "./types.js";
import { getOwnerAccounts, getSettings, appendBuyin, markCashoutMatched } from "./sheets.js";
import { findMatch } from "./matcher.js";

// ----- Session (state) -----
type SessionData = {
  step?: "IDLE" | "METHOD" | "AMOUNT";
  method?: Method;
};
type MyContext = Context & SessionFlavor<SessionData>;

// ----- Bot -----
const bot = new Bot<MyContext>(BOT_TOKEN);
bot.use(session({ initial: (): SessionData => ({ step: "IDLE" }) }));

// /start
bot.command("start", async (ctx) => {
  const settings = await getSettings();
  const kb = new InlineKeyboard().text("💸 Buy-In", "BUYIN");
  await ctx.reply(`Welcome to ${settings.CLUB_NAME}! Choose an option:`, { reply_markup: kb });
});

bot.callbackQuery("BUYIN", async (ctx) => {
  const settings = await getSettings();
  const enabled = settings.METHODS_ENABLED;
  const kb = new InlineKeyboard();
  enabled.forEach((m) => kb.text(m, `METHOD_${m}`).row());
  await ctx.editMessageText("Select a payment method:", { reply_markup: kb });
  ctx.session.step = "METHOD";
});

bot.callbackQuery(/^METHOD_(ZELLE|VENMO|CASHAPP)$/, async (ctx) => {
  const match = ctx.match as RegExpExecArray;
  const method = match[1] as Method;
  const settings = await getSettings();
  if (!settings.METHODS_ENABLED.includes(method)) {
    await ctx.answerCallbackQuery({ text: "Method not enabled", show_alert: true });
    return;
  }
  ctx.session.method = method;
  ctx.session.step = "AMOUNT";
  const kb = new InlineKeyboard()
    .text("$25", "AMT_25").text("$50", "AMT_50").row()
    .text("$75", "AMT_75").text("$100", "AMT_100").row()
    .text("$200", "AMT_200").row()
    .text("Custom amount", "AMT_CUSTOM");
  await ctx.editMessageText(`Selected ${method}. Pick an amount:`, { reply_markup: kb });
});

bot.callbackQuery(/^AMT_(\d+)$/, async (ctx) => {
  const match = ctx.match as RegExpExecArray;
  const amount = Number(match[1]);
  await handleAmount(ctx, amount);
});

bot.callbackQuery("AMT_CUSTOM", async (ctx) => {
  await ctx.editMessageText("Send the amount you want to buy in (numbers only).");
});

bot.on("message:text", async (ctx) => {
  if (ctx.session.step !== "AMOUNT") return;
  const raw = ctx.message.text.trim();
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    await ctx.reply("Please send a valid number amount (e.g., 75).");
    return;
  }
  await handleAmount(ctx, amount);
});

async function handleAmount(ctx: MyContext, amount: number) {
  const method = ctx.session.method as Method | undefined;
  if (!method) {
    await ctx.reply("Please start again with /start");
    return;
  }
  const settings = await getSettings();
  const owners = await getOwnerAccounts();

  // record buyin
  const now = new Date().toISOString();
  const buyin_id = `B-${Date.now()}`;
  await appendBuyin({
    buyin_id,
    tg_user_id: ctx.from!.id,
    display_name: ctx.from!.username || ctx.from!.first_name || String(ctx.from!.id),
    method,
    amount,
    status: "PENDING",
    assigned_to: "",
    created_at: now,
    updated_at: now
  });

  // find a match
  const match = await findMatch(method, amount, owners, settings.OWNER_FALLBACK_THRESHOLD);

  if (match.type === "OWNER") {
    const { owner } = match;
    const kb = new InlineKeyboard().text("✅ Mark Paid", "MARKPAID_OWNER");
    await ctx.reply(
      `Pay **${amount} ${settings.CURRENCY}** via ${owner.method} to ${owner.handle}.\n\n${owner.instructions}`,
      { parse_mode: "Markdown", reply_markup: kb }
    );
  } else {
    await markCashoutMatched(match.cashout.cashout_id, ctx.from!.id);
    const recv = match.cashout.receiver_handle || "<ask recipient for handle>";
    const kb = new InlineKeyboard().text("✅ Mark Paid", `MARKPAID_CASHOUT_${match.cashout.cashout_id}`);
    await ctx.reply(
      `Matched to cash-out request **${match.cashout.cashout_id}**.\n` +
      `Pay **${match.amount} ${settings.CURRENCY}** via ${match.cashout.method} to **${recv}**.\n\n` +
      `After sending, tap 'Mark Paid'.`,
      { parse_mode: "Markdown", reply_markup: kb }
    );
  }

  // reset flow
  ctx.session.step = "IDLE";
  ctx.session.method = undefined;
}

// ----- Webhook / Server (fixed) -----
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => res.send("OK"));

if (BASE_URL) {
  // Production: webhook mode
  app.use(`/${BOT_TOKEN}`, webhookCallback(bot, "express"));
  app.listen(PORT, async () => {
    console.log(`Server on :${PORT}`);
    try {
      const url = `${BASE_URL}/${BOT_TOKEN}`;
      await bot.api.setWebhook(url);
      console.log("Webhook set to", url);
    } catch (e) {
      console.error("Failed to set webhook", e);
    }
  });
} else {
  // Local dev: long polling only
  app.listen(PORT, () => console.log(`Server on :${PORT}`));
  bot.start();
}
