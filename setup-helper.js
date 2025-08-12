#!/usr/bin/env node

console.log(`
🚀 PAY-N-PLAY BOT SETUP HELPER
================================

This will help you get all the required values for your bot.

STEP 1: TELEGRAM BOT TOKEN
--------------------------
1. Open Telegram and message @BotFather
2. Send: /newbot
3. Follow the instructions
4. Copy the token (looks like: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz)

STEP 2: GOOGLE SHEET ID
-----------------------
1. Open your Google Sheet
2. Copy the ID from the URL:
   https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit
3. The SHEET_ID is the long string between /d/ and /edit

STEP 3: GOOGLE SERVICE ACCOUNT
------------------------------
1. Go to: https://console.cloud.google.com/
2. Create a new project or select existing
3. Enable Google Sheets API:
   - Go to "APIs & Services" → "Library"
   - Search for "Google Sheets API"
   - Click "Enable"
4. Create Service Account:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "Service Account"
   - Fill in details and click "Create"
5. Download JSON key:
   - Click on the service account email
   - Go to "Keys" tab
   - Click "Add Key" → "Create new key" → "JSON"
   - Download the file
6. Extract values from JSON:
   - Open the downloaded JSON file
   - Copy "client_email" value
   - Copy "private_key" value (keep the quotes and \\n escapes)

STEP 4: SHARE GOOGLE SHEET
--------------------------
1. Open your Google Sheet
2. Click "Share" button
3. Add the service account email (from step 3)
4. Give it "Editor" permissions
5. Click "Send"

STEP 5: DEPLOY TO RAILWAY
-------------------------
1. Go to: https://railway.app/
2. Sign up with GitHub
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose your paynplay repository
6. Go to Variables tab and add all the values from steps 1-3

Your bot will be live in minutes! 🎉

Need help? Check DEPLOYMENT.md for detailed instructions.
`);

// Simple validation helper
if (process.argv.includes('--validate')) {
  console.log(`
VALIDATION CHECKLIST:
- [ ] BOT_TOKEN: Should be ~50 characters, format: 1234567890:ABCdef...
- [ ] SHEET_ID: Should be ~44 characters, alphanumeric
- [ ] GOOGLE_CLIENT_EMAIL: Should end with @project.iam.gserviceaccount.com
- [ ] GOOGLE_PRIVATE_KEY: Should start with "-----BEGIN PRIVATE KEY-----"
- [ ] Google Sheet shared with service account email
- [ ] Railway deployment successful
- [ ] Bot responds to /ping command
`);
}


