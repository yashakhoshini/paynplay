# 🚀 Quick Test Guide - Fix Your Bot

## The Problem
Your bot wasn't responding because of a **webhook vs polling conflict**. When `BASE_URL` is set, the bot tries to use webhook mode, but if you're testing locally, the webhook points to your Railway server instead of your local machine.

## The Fix Applied
✅ **Fixed startup logic** to properly handle development vs production modes
✅ **Added webhook cleanup** to delete existing webhooks when using polling
✅ **Enhanced logging** to show exactly what mode the bot is running in

## How to Test

### Option 1: Test Locally (Recommended)
```bash
# Make sure BASE_URL is NOT set locally
unset BASE_URL

# Or set NODE_ENV to development
export NODE_ENV=development

# Start the bot
npm run dev
```

### Option 2: Test with Minimal Bot
```bash
# Test with the minimal bot first
node test-minimal-bot.js
```

### Option 3: Debug Startup
```bash
# Check what's happening during startup
node debug-startup.js
```

## What to Look For

### ✅ Success Indicators
- `Starting bot with long polling mode (development/local)`
- `Deleted existing webhook`
- `✅ Bot started successfully with polling`
- `Server on :8080 (long polling)`

### ❌ Problem Indicators
- `Starting bot with webhook mode` (when testing locally)
- `Failed to set webhook`
- No "Bot started successfully" message

## Test Commands
Once the bot is running, send these to your bot:
- `/start` - Should show buy-in/withdraw menu
- `/ping` - Should reply "pong ✅"
- `/help` - Should show help message

## Environment Variables for Local Testing
```bash
# Required
BOT_TOKEN=your_bot_token_here

# Optional (for full functionality)
SHEET_ID=your_sheet_id
GOOGLE_CLIENT_EMAIL=your_service_account_email
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Leave these UNSET for local testing
# BASE_URL=  # Don't set this locally!
# LOADER_GROUP_ID=
# ALLOWED_USER_IDS=
```

## If Still Not Working
1. **Check webhook status**: `curl "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"`
2. **Delete webhook**: `curl "https://api.telegram.org/bot$BOT_TOKEN/deleteWebhook"`
3. **Check logs** for any error messages
4. **Verify BOT_TOKEN** is correct and valid
