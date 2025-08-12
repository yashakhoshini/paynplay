# Railway Deployment Guide

## Quick Deploy to Railway (Recommended)

### Step 1: Push to GitHub
1. **Create a new repository on GitHub**
2. **Upload all files** (you can drag and drop the entire folder)
3. **Or use GitHub Desktop** if you have it installed

### Step 2: Deploy to Railway
1. **Go to https://railway.app/**
2. **Sign up/Login** with your GitHub account
3. **Click "New Project"**
4. **Select "Deploy from GitHub repo"**
5. **Choose your paynplay repository**
6. **Railway will automatically detect it's a Node.js project**

### Step 3: Set Environment Variables
In Railway dashboard, go to your project → Variables tab and add:

#### Required Variables:
```
BOT_TOKEN=your_telegram_bot_token_here
SHEET_ID=your_google_sheet_id_here
GOOGLE_CLIENT_EMAIL=your_service_account_email@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here with \n escapes\n-----END PRIVATE KEY-----\n"
```

#### Optional Variables:
```
BASE_URL=https://your-app-name.up.railway.app
PORT=8080
METHODS_ENABLED_DEFAULT=ZELLE,VENMO,CASHAPP
CURRENCY_DEFAULT=USD
FAST_FEE_PCT_DEFAULT=0.02
OWNER_FALLBACK_THRESHOLD=999999
OWNER_TG_USERNAME=your_telegram_username
ZELLE_HANDLE=your@email.com
VENMO_HANDLE=@your_venmo_handle
CASHAPP_HANDLE=$your_cashapp_handle
```

### Step 4: Get Your Values

#### 1. Telegram Bot Token:
- Message @BotFather on Telegram
- Send `/newbot`
- Follow instructions
- Copy the token

#### 2. Google Sheet ID:
- Open your Google Sheet
- Copy the ID from URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`

#### 3. Google Service Account:
- Go to https://console.cloud.google.com/
- Create new project or select existing
- Enable Google Sheets API
- Go to "APIs & Services" → "Credentials"
- Click "Create Credentials" → "Service Account"
- Download JSON key file
- Extract `client_email` and `private_key`
- Share your Google Sheet with the `client_email`

### Step 5: Verify Deployment
1. **Railway will automatically deploy**
2. **Check the logs** for any errors
3. **Your app URL will be shown** (e.g., https://your-app-name.up.railway.app)
4. **Set BASE_URL** to your app URL in Railway variables
5. **Test the bot** by sending `/ping` to your bot on Telegram

## Manual GitHub Upload (if Git isn't working)

1. **Go to GitHub.com**
2. **Create new repository** called "paynplay"
3. **Click "uploading an existing file"**
4. **Drag and drop all files** from your project folder
5. **Commit the files**
6. **Follow Railway deployment steps above**

## Troubleshooting

### If deployment fails:
- Check Railway logs for errors
- Verify all environment variables are set
- Make sure Google Sheet is shared with service account email

### If bot doesn't respond:
- Check if BASE_URL is set correctly
- Verify webhook is set: `https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo`
- Check Railway logs for errors

### Common Issues:
- **403 Permission denied**: Share Google Sheet with service account
- **400 Parse range**: Missing tab - bot will auto-fallback
- **502 errors**: Check Railway logs - usually missing env vars


