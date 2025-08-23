# PaynPlay Bot - Multi-Tenant Setup Guide

## Overview

This guide explains how to set up and manage multiple clubs (tenants) using the PaynPlay bot system. Each club gets its own configuration, Google Sheet, and deployment.

## Quick Start

### 1. Create Club Configuration

```bash
# Copy the template
cp .env.template .env.club_name

# Edit the configuration
nano .env.club_name
```

### 2. Deploy Club

```bash
# Linux/Mac
./deploy-club.sh club_name

# Windows
deploy-club.bat club_name
```

## File Structure

```
paynplay/
├── .env.template          # Template for new clubs
├── .env.club1            # Club 1 configuration
├── .env.club2            # Club 2 configuration
├── .env.club3            # Club 3 configuration
├── deploy-club.sh        # Linux/Mac deployment script
├── deploy-club.bat       # Windows deployment script
└── MULTI-TENANT-SETUP.md # This guide
```

## Configuration Options

### Bot Tokens

**Option A: One Bot Token (Simpler)**
- Use the same bot token for all clubs
- Differentiate by bot username or club selection
- Pros: Easier to manage
- Cons: Less separation

**Option B: Separate Bot Tokens (Recommended)**
- Each club gets its own bot token from @BotFather
- Pros: Complete separation, better analytics
- Cons: More tokens to manage

### Google Sheets

**Option A: Separate Sheets (Recommended)**
- Each club gets its own Google Sheet
- Pros: Complete data separation
- Cons: More sheets to manage

**Option B: One Sheet, Multiple Tabs**
- One Google Sheet with separate tabs per club
- Pros: Easier to manage
- Cons: Risk of data mixing

## Club Configuration Template

```bash
# Bot Configuration
BOT_TOKEN=your_bot_token_here
BOT_USERNAME=your_bot_username_here

# Club Identification
CLIENT_NAME=Your Club Name
CLIENT_ID=your_club_id_01

# Google Sheet
SHEET_ID=your_google_sheet_id_here
GOOGLE_CLIENT_EMAIL=your_service_account_email@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"

# Payment Methods (customize per club)
METHODS_ENABLED_DEFAULT=VENMO,ZELLE,PAYPAL,CASHAPP,APPLE PAY,CRYPTO,CARD
METHODS_CIRCLE=VENMO,ZELLE,CASHAPP
METHODS_EXTERNAL_LINK=PAYPAL,APPLE PAY,CRYPTO,CARD

# Club-Specific Payment Handles
ZELLE_HANDLE=@your_zelle_handle
VENMO_HANDLE=@your_venmo_handle
CASHAPP_HANDLE=$your_cashapp_handle
PAYPAL_HANDLE=your_paypal_email@example.com

# Limits and Settings
MIN_BUYIN_AMOUNT=20
MAX_BUYIN_AMOUNT=10000
OWNER_FALLBACK_THRESHOLD=100
LOADER_GROUP_ID=-1001234567890
CURRENCY_DEFAULT=USD
FAST_FEE_PCT_DEFAULT=0.02
```

## Step-by-Step Setup

### 1. Create New Club

```bash
# 1. Copy template
cp .env.template .env.poker_club

# 2. Edit configuration
nano .env.poker_club

# 3. Deploy
./deploy-club.sh poker_club
```

### 2. Get Bot Token

1. Message @BotFather on Telegram
2. Send `/newbot`
3. Choose name: "Poker Club Bot"
4. Choose username: "poker_club_bot"
5. Copy the token to your `.env.poker_club`

### 3. Create Google Sheet

1. Create new Google Sheet
2. Copy the template from your existing sheet
3. Share with your service account email
4. Copy the Sheet ID to your configuration

### 4. Set Payment Methods

Customize payment methods per club:

```bash
# High-end casino
METHODS_ENABLED_DEFAULT=PAYPAL,CRYPTO,CARD
METHODS_CIRCLE=PAYPAL
METHODS_EXTERNAL_LINK=CRYPTO,CARD

# Local poker club
METHODS_ENABLED_DEFAULT=VENMO,ZELLE,CASHAPP
METHODS_CIRCLE=VENMO,ZELLE
METHODS_EXTERNAL_LINK=CASHAPP
```

## Deployment Options

### Railway (Recommended)

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Deploy club
./deploy-club.sh poker_club

# 4. Set environment variables
railway variables set BOT_TOKEN="your_token"
railway variables set SHEET_ID="your_sheet_id"
# ... set other variables
```

### Heroku

```bash
# 1. Create app
heroku create poker-club-bot

# 2. Set environment variables
heroku config:set BOT_TOKEN="your_token"
heroku config:set SHEET_ID="your_sheet_id"
# ... set other variables

# 3. Deploy
git push heroku main
```

### Local Development

```bash
# 1. Load club configuration
./deploy-club.sh poker_club

# 2. Start bot
npm start
```

## Security Considerations

### Environment Variables

- Never commit `.env` files to version control
- Use secure deployment platforms (Railway, Heroku)
- Rotate bot tokens regularly
- Use service accounts for Google Sheets

### Data Separation

- Each club has its own Google Sheet
- Different bot tokens per club
- Separate deployment instances
- Club-specific payment handles

## Troubleshooting

### Common Issues

1. **Bot not responding**
   - Check bot token is correct
   - Verify webhook is set correctly
   - Check deployment logs

2. **Google Sheets not working**
   - Verify service account has access
   - Check sheet ID is correct
   - Ensure sheet has required tabs

3. **Payment methods not showing**
   - Check METHODS_ENABLED_DEFAULT
   - Verify payment handles are set
   - Check Google Sheet settings

### Debug Commands

```bash
# Check bot status
curl https://api.telegram.org/bot<BOT_TOKEN>/getMe

# Check webhook
curl https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo

# Test Google Sheets access
npm run test-sheets
```

## Best Practices

### Club Management

1. **Naming Convention**
   - Use descriptive club names: `poker_club`, `casino_royale`
   - Consistent file naming: `.env.club_name`

2. **Configuration Management**
   - Keep templates updated
   - Document club-specific settings
   - Regular configuration backups

3. **Deployment**
   - Test configurations locally first
   - Use staging environments
   - Monitor deployment logs

### Payment Methods

1. **Security**
   - Use different payment handles per club
   - Regular handle rotation
   - Monitor for suspicious activity

2. **Flexibility**
   - Allow clubs to customize methods
   - Support different currencies
   - Configurable limits

## Support

For issues or questions:

1. Check the troubleshooting section
2. Review deployment logs
3. Test with minimal configuration
4. Contact support with club name and error details

## Example Configurations

### High-End Casino
```bash
CLIENT_NAME=Casino Royale
METHODS_ENABLED_DEFAULT=PAYPAL,CRYPTO,CARD
MIN_BUYIN_AMOUNT=100
MAX_BUYIN_AMOUNT=50000
FAST_FEE_PCT_DEFAULT=0.03
```

### Local Poker Club
```bash
CLIENT_NAME=Local Poker Club
METHODS_ENABLED_DEFAULT=VENMO,ZELLE,CASHAPP
MIN_BUYIN_AMOUNT=20
MAX_BUYIN_AMOUNT=1000
FAST_FEE_PCT_DEFAULT=0.02
```

### Online Tournament
```bash
CLIENT_NAME=Online Tournament
METHODS_ENABLED_DEFAULT=PAYPAL,CRYPTO
MIN_BUYIN_AMOUNT=50
MAX_BUYIN_AMOUNT=5000
FAST_FEE_PCT_DEFAULT=0.025
```

