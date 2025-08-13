# 🚨 QUICK FIX: Bot Not Responding to /start and /ping

## The Problem
Your bot is **crashing on startup** because the `BOT_TOKEN` environment variable is missing or invalid. The bot never actually starts, so it can't respond to any commands.

## The Fix

### 1. Check Your Railway Environment Variables
Go to your Railway dashboard and check if `BOT_TOKEN` is set:

1. Go to https://railway.app/dashboard
2. Find your bot service
3. Click on "Variables" tab
4. Look for `BOT_TOKEN`

### 2. If BOT_TOKEN is Missing
You need to set it:

1. Get your bot token from @BotFather on Telegram
2. In Railway Variables, add:
   - **Name**: `BOT_TOKEN`
   - **Value**: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz` (your actual token)

### 3. If BOT_TOKEN is Set But Invalid
Check the format:
- Should be: `number:alphanumeric`
- Example: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`
- If it's wrong, update it with the correct token

### 4. Deploy the Fixed Code
The code has been fixed to:
- ✅ Not crash on missing BOT_TOKEN
- ✅ Show clear error messages
- ✅ Add debugging logs
- ✅ Add health check endpoint

### 5. Test the Fix
After deploying:

1. **Check the logs** in Railway for startup messages
2. **Visit health endpoint**: `https://your-app.up.railway.app/health`
3. **Test the bot**: Send `/ping` to your bot

## Expected Logs
You should see these logs on startup:
```
[timestamp] [client-name] ✓ Bot token validated successfully
[timestamp] [client-name] Starting bot with webhook mode
[timestamp] [client-name] Server started on port 8080
[timestamp] [client-name] Setting webhook to: https://your-app.up.railway.app/your-bot-token
[timestamp] [client-name] Webhook set successfully
```

## If Still Not Working
1. Check Railway logs for any errors
2. Make sure your bot token is valid (test with @BotFather)
3. Verify the webhook URL is accessible
4. Try sending `/ping` again

## Quick Test
Run this in your browser to test the health endpoint:
```
https://your-app-name.up.railway.app/health
```

You should see a JSON response with your bot status.
