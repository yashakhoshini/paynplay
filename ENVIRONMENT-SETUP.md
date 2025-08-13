# Environment Variables Setup Guide

## 🚀 Production Deployment Requirements

You **MUST** set up these environment variables for your bot to work properly in production.

## 📋 Required Variables

### 1. Bot Token (REQUIRED)
```bash
BOT_TOKEN=your_telegram_bot_token_here
```
- Get this from @BotFather on Telegram
- Format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`

### 2. Owner Payment Handles (REQUIRED for withdrawals)
```bash
ZELLE_HANDLE=your@email.com
VENMO_HANDLE=@your_venmo_handle
CASHAPP_HANDLE=$your_cashapp_handle
PAYPAL_HANDLE=your@paypal_email.com
```
**These are CRITICAL** - without them, withdrawals won't work!

### 3. Google Sheets Integration (Optional but recommended)
```bash
SHEET_ID=your_google_sheet_id_here
GOOGLE_CLIENT_EMAIL=your_service_account_email@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here with \n escapes\n-----END PRIVATE KEY-----\n"
```

## 🔧 How to Set Up

### Option 1: Local Development (.env file)
1. Copy `env-example.txt` to `.env`
2. Fill in your values
3. The bot will automatically load these

### Option 2: Production Deployment (Railway/Railway)
1. Go to your Railway dashboard
2. Navigate to your app's "Variables" tab
3. Add each variable with its value

### Option 3: Using the Setup Script
```bash
# Windows
setup-dev-environment.bat

# Linux/Mac
./setup-dev-environment.sh
```

## 🎯 Critical Variables for Production

### Payment Handles (MUST HAVE)
```bash
# Replace with your actual payment handles
ZELLE_HANDLE=your@email.com
VENMO_HANDLE=@your_venmo_username
CASHAPP_HANDLE=$your_cashapp_username
PAYPAL_HANDLE=your@paypal_email.com
```

### Group Workflow (Recommended)
```bash
LOADER_GROUP_ID=-1001234567890  # Your loader group ID (negative number)
ALLOWED_USER_IDS=123456789,987654321  # Comma-separated list of loader user IDs
```

### Bot Configuration
```bash
BOT_USERNAME=your_bot_username  # Without the @ symbol
CLIENT_NAME=Your Club Name
CLIENT_ID=your_club_id
```

## 🔍 Testing Your Setup

Run this command to verify your environment variables:
```bash
node debug-env.js
```

## 🚨 Common Issues

### "No payment methods available" error
- **Cause**: Missing payment handle environment variables
- **Fix**: Set ZELLE_HANDLE, VENMO_HANDLE, etc.

### Bot not responding
- **Cause**: Invalid BOT_TOKEN
- **Fix**: Get a fresh token from @BotFather

### Withdrawals not working
- **Cause**: No owner payment handles configured
- **Fix**: Set up your payment handles in environment variables

## 📝 Example .env File

```bash
# Required
BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# Payment Handles (REQUIRED for withdrawals)
ZELLE_HANDLE=your@email.com
VENMO_HANDLE=@your_venmo_handle
CASHAPP_HANDLE=$your_cashapp_handle
PAYPAL_HANDLE=your@paypal_email.com

# Group Settings
LOADER_GROUP_ID=-1001234567890
ALLOWED_USER_IDS=123456789,987654321
BOT_USERNAME=your_bot_username

# Club Info
CLIENT_NAME=Your Club Name
CLIENT_ID=your_club_id

# Optional Google Sheets
SHEET_ID=your_google_sheet_id
GOOGLE_CLIENT_EMAIL=your_service_account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour key here\n-----END PRIVATE KEY-----\n"
```

## ✅ Verification Checklist

Before deploying to production, ensure you have:

- [ ] BOT_TOKEN set and valid
- [ ] At least one payment handle configured (ZELLE_HANDLE, VENMO_HANDLE, etc.)
- [ ] LOADER_GROUP_ID set (if using group workflow)
- [ ] ALLOWED_USER_IDS set (if using group workflow)
- [ ] CLIENT_NAME and CLIENT_ID set
- [ ] Tested the bot locally with these variables

## 🚀 Next Steps

1. Set up your environment variables
2. Test locally with `node debug-env.js`
3. Deploy to Railway/Railway
4. Test all functionality (buy-ins and withdrawals)
5. Monitor logs for any issues

Remember: **Payment handles are required for withdrawals to work!**
