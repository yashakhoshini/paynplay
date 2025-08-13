# Client Onboarding Guide - Multi-Tenant Bot System

This guide explains how to onboard new clients for the PayNPlay bot system. Each client gets their own isolated bot instance.

## Overview

**One Bot Per Club Model:**
- Each club gets its own Telegram bot (@username + token)
- Each club gets its own Railway service (separate deploy, logs)
- Each club gets its own Google Sheet
- Each club has its own loader group + allowed users
- Complete isolation between clients

## Pre-Client Setup (One-time)

### 1. Google Service Account Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or use existing
3. Enable Google Sheets API
4. Create a service account
5. Download the JSON key file
6. Note the service account email (ends with `@your-project.iam.gserviceaccount.com`)

### 2. Railway Project Setup
1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Create a new project called "PayNPlay Bots"
3. This project will contain all client services

### 3. Bot Template Repository
- Your current GitHub repo serves as the template
- All clients use the same codebase
- Updates are deployed to all clients when needed

## Per-Client Onboarding Process

### Step 1: Collect Client Information

**Required from client:**
- Club name (for service naming)
- Google Sheet link (we extract the Sheet ID)
- Telegram group for loaders/owners
- List of owner Telegram user IDs
- List of loader Telegram user IDs

**Optional from client:**
- Payment handles (Zelle, Venmo, etc.)
- Club display name
- Currency preference
- Fast fee percentage

### Step 2: Create Bot Token

1. Message @BotFather on Telegram
2. Send `/newbot`
3. Choose a name (e.g., "Poker Club Bot")
4. Choose a username (e.g., "pokerclub_bot")
5. Copy the bot token (format: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)

### Step 3: Get Telegram IDs

**For Group ID:**
1. Add @userinfobot to the client's Telegram group
2. Send any message in the group
3. Copy the negative chat ID (e.g., `-1001234567890`)

**For User IDs:**
1. Each owner/loader messages @userinfobot privately
2. Copy their user IDs (positive numbers)
3. Combine into comma-separated lists

### Step 4: Prepare Google Sheet

1. Client creates or provides their Google Sheet
2. Extract the Sheet ID from the URL
3. Share the sheet with your service account email (Editor access)
4. Ensure the sheet has the required columns (see Sheet Structure below)

### Step 5: Deploy Client Service

**Option A: Using the onboarding script**
```bash
onboard-client.bat <club-name> <bot-token> <sheet-id> <group-id> <owner-ids> <loader-ids>
```

**Option B: Manual deployment**
1. Go to Railway dashboard
2. Create new service from GitHub repo
3. Set all environment variables (see Environment Variables section)
4. Deploy

### Step 6: Set Google Credentials

1. Go to the client's Railway service
2. Variables tab
3. Add:
   - `GOOGLE_CLIENT_EMAIL` = your service account email
   - `GOOGLE_PRIVATE_KEY` = your service account private key (with `\n` escapes)

### Step 7: Test the Setup

1. **Test bot response:** Send `/ping` to the bot
2. **Test webhook:** Verify webhook is set correctly
3. **Test buy-in flow:** Create a test buy-in request
4. **Test payment confirmation:** Have an owner/loader mark payment as received
5. **Test sheet updates:** Verify the Google Sheet is updated

## Environment Variables Matrix

| Variable | Example | Required | Description |
|----------|---------|----------|-------------|
| `BOT_TOKEN` | `1234567890:ABCdef...` | ✅ | Bot token from BotFather |
| `SHEET_ID` | `1bPmL...WFKc` | ✅ | Google Sheet ID |
| `LOADER_GROUP_ID` | `-1001234567890` | ✅ | Telegram group chat ID |
| `OWNER_IDS` | `123456789,987654321` | ✅ | Comma-separated owner user IDs |
| `LOADER_IDS` | `111222333,444555666` | ✅ | Comma-separated loader user IDs |
| `ALLOWED_USER_IDS` | `123456789,987654321,111222333,444555666` | ✅ | Combined owner + loader IDs |
| `GOOGLE_CLIENT_EMAIL` | `paynplay@project.iam.gserviceaccount.com` | ✅ | Service account email |
| `GOOGLE_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n` | ✅ | Service account private key |
| `BASE_URL` | `https://clubname.up.railway.app` | ✅ | Service URL |
| `CLIENT_NAME` | `pokerclub` | ✅ | Client identifier |
| `CLIENT_ID` | `pokerclub` | ✅ | Client identifier |
| `METHODS_ENABLED_DEFAULT` | `ZELLE,VENMO,CASHAPP,PAYPAL` | ❌ | Payment methods |
| `CURRENCY_DEFAULT` | `USD` | ❌ | Default currency |
| `FAST_FEE_PCT_DEFAULT` | `0.02` | ❌ | Fast fee percentage |
| `MAX_BUYIN_AMOUNT` | `10000` | ❌ | Maximum buy-in amount |
| `MIN_BUYIN_AMOUNT` | `20` | ❌ | Minimum buy-in amount |

## Google Sheet Structure

The bot expects these columns in the Google Sheet:

**Required columns:**
- `Timestamp` - When the request was created
- `Player` - Player's name
- `Amount` - Buy-in amount
- `Method` - Payment method (Zelle, Venmo, etc.)
- `Status` - Request status (pending, paid, cancelled)
- `Transaction_ID` - Unique transaction identifier

**Optional columns:**
- `Verified_By` - Who confirmed the payment
- `Verified_At` - When payment was confirmed
- `Notes` - Additional notes

## Testing Checklist

- [ ] Bot responds to `/ping`
- [ ] Bot responds to `/start`
- [ ] Buy-in request creates transaction card in group
- [ ] Only owners/loaders can see "Mark Paid" button
- [ ] Payment confirmation updates Google Sheet
- [ ] Group message updates after payment confirmation
- [ ] Error handling works for unauthorized users
- [ ] Webhook is set correctly

## Troubleshooting

### Common Issues

**Bot not responding:**
- Check if webhook is set correctly
- Verify bot token is valid
- Check Railway logs for errors

**Payment confirmation not working:**
- Verify user IDs are correct
- Check if user is in OWNER_IDS or LOADER_IDS
- Ensure bot is added to the group

**Google Sheet not updating:**
- Verify service account has Editor access
- Check GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY
- Ensure sheet has required columns

**Group workflow disabled:**
- Verify LOADER_GROUP_ID is set and negative
- Ensure bot is added to the group

### Logs and Debugging

1. Check Railway logs for the specific client service
2. Look for configuration warnings
3. Verify all environment variables are set
4. Test webhook status: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`

## Client Management

### Updating Client Settings

1. Go to client's Railway service
2. Variables tab
3. Update any variables
4. Service restarts automatically

### Rolling Out Updates

1. Update code in GitHub template repo
2. For each client service in Railway:
   - Click "Redeploy" or
   - Set up GitHub Action for bulk redeploy

### Suspending a Client

1. Go to client's Railway service
2. Click "Settings"
3. Click "Suspend Service"

### Client Data Access

- Each client's data is isolated in their own Google Sheet
- No cross-client data access
- Client can export their data anytime

## Security Considerations

- Never commit bot tokens or Google credentials to version control
- Each client has isolated credentials
- Service account has minimal required permissions
- All sensitive data stored in Railway environment variables
- Regular security audits recommended

## Support and Maintenance

### Client Support
- Each client has their own service logs
- Issues are isolated to specific clients
- Easy to debug client-specific problems

### System Maintenance
- Code updates deployed to all clients
- Environment variables managed per client
- Backup and recovery procedures per client

---

**Quick Reference:**
- **Onboarding script:** `onboard-client.bat`
- **Development setup:** `setup-dev-environment.bat`
- **Railway dashboard:** https://railway.app/dashboard
- **Google Cloud Console:** https://console.cloud.google.com/
- **BotFather:** @BotFather on Telegram
- **User ID helper:** @userinfobot on Telegram
