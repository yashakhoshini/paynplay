// Minimal test bot to verify Telegram connectivity
import { Bot } from 'grammy';

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is missing!');
  process.exit(1);
}

console.log('🤖 Starting minimal test bot...');

const bot = new Bot(BOT_TOKEN);

// Simple ping command
bot.command('ping', async (ctx) => {
  console.log('Ping received from:', ctx.from?.id);
  await ctx.reply('pong ✅');
});

// Simple start command
bot.command('start', async (ctx) => {
  console.log('Start received from:', ctx.from?.id);
  await ctx.reply('Hello! I\'m a test bot. Send /ping to test me.');
});

// Start the bot with polling
bot.start({
  drop_pending_updates: true,
  onStart: () => {
    console.log('✅ Bot started successfully with polling');
    console.log('📱 Send /start or /ping to test');
  }
});

console.log('🔄 Bot is running... Press Ctrl+C to stop');
