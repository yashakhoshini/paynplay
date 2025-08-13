# Multi-Tenant Bot Deployment Guide

## Overview
This guide explains how to deploy individual bot instances for each club using a single codebase.

## Architecture
- **Template Repository**: Single codebase used by all clubs
- **Per-Club Instances**: Each club gets their own Railway service with unique configuration
- **Shared Service Account**: One Google service account handles all clubs' sheets

## One-Time Setup

### 1. Prepare Template Repository
1. Clean up the current repository (remove any club-specific data)
2. Make it a GitHub template repository
3. Ensure all environment variables are configurable

### 2. Create Google Service Account
1. Create one service account in Google Cloud Console
2. Download the JSON credentials
3. This service account will access all clubs' sheets

### 3. Create Railway Project
1. Create a single Railway project
2. You'll add multiple services to this project (one per club)

## Per-Club Onboarding Process

### Step 1: Create Telegram Bot
1. Message @BotFather on Telegram
2. Send `/newbot`
3. Choose a name (e.g., "Poker Club Bot")
4. Choose a username (e.g., "@pokerclub_bot")
5. **Save the bot token** - you'll need this for Railway

### Step 2: Set Up Google Sheet
1. Client provides their existing sheet or creates a new one
2. Share the sheet with your service account email (Editor access)
3. **Save the sheet ID** from the URL

### Step 3: Create Loader Group
1. Client creates a Telegram group for loaders/owners
2. Add your bot to the group
3. Get the group chat ID:
   - Add @RawDataBot to the group, or
   - Use your bot's logs when it joins
4. **Save the group chat ID**

### Step 4: Deploy to Railway
1. Go to your Railway project
2. Click "New Service" → "Deploy from GitHub"
3. Select your template repository
4. Set environment variables (see table below)
5. Deploy the service

### Step 5: Configure Webhook
1. Railway provides a public URL (e.g., `https://pokerclub-bot.up.railway.app`)
2. The bot automatically sets the webhook to: `https://pokerclub-bot.up.railway.app/<BOT_TOKEN>`
3. Verify webhook is set: `https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo`

### Step 6: Test the Bot
1. DM the bot `/ping` - should respond "pong ✅"
2. DM the bot `/start` - should show welcome message
3. Test a buy-in flow
4. Verify transaction cards appear in loader group
5. Test "Mark Paid" functionality

## Environment Variables Matrix

| Variable | Description | Example |
|----------|-------------|---------|
| `BOT_TOKEN` | Telegram bot token | `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz` |
| `SHEET_ID` | Google Sheet ID | `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms` |
| `GOOGLE_CLIENT_EMAIL` | Service account email | `bot@project.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | Service account private key | `-----BEGIN PRIVATE KEY-----\n...` |
| `LOADER_GROUP_ID` | Telegram group chat ID | `-1001234567890` |
| `ALLOWED_USER_IDS` | Comma-separated loader IDs | `123456789,987654321` |
| `BASE_URL` | Railway app URL | `https://pokerclub-bot.up.railway.app` |
| `PORT` | Port (usually 8080) | `8080` |

## Automation Opportunities

### Automated Deployment Script
```bash
#!/bin/bash
# deploy-club.sh
CLUB_NAME=$1
BOT_TOKEN=$2
SHEET_ID=$3
GROUP_ID=$4
ALLOWED_IDS=$5

# Create Railway service
railway service create $CLUB_NAME

# Set environment variables
railway variables set BOT_TOKEN=$BOT_TOKEN
railway variables set SHEET_ID=$SHEET_ID
railway variables set LOADER_GROUP_ID=$GROUP_ID
railway variables set ALLOWED_USER_IDS=$ALLOWED_IDS
# ... set other variables

# Deploy
railway up
```

### Client Onboarding Form
Create a simple form to collect:
- Club name
- Bot username preference
- Google Sheet URL
- Loader group details
- Contact information

## Maintenance

### Code Updates
When you update the template repository:
1. Each Railway service can be updated independently
2. Use Railway's "Redeploy" feature
3. Consider automated deployment for critical updates

### Monitoring
- Each service has its own logs in Railway
- Set up alerts for each service
- Monitor webhook health for each bot

## Troubleshooting

### Common Issues
1. **Webhook not set**: Check BASE_URL and BOT_TOKEN
2. **Sheet access denied**: Verify service account has Editor access
3. **Group messages not working**: Check LOADER_GROUP_ID format
4. **Bot not responding**: Check Railway logs

### Debug Commands
- `/ping` - Test bot responsiveness
- Check webhook: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
- Check Railway logs for errors

## Cost Considerations
- Railway charges per service (typically $5-20/month per club)
- Google Sheets API has generous free tier
- Consider bulk discounts for multiple services

## Security Best Practices
1. Use different bot tokens for each club
2. Keep service account credentials secure
3. Regularly rotate bot tokens
4. Monitor for unusual activity
5. Use environment variables for all sensitive data


