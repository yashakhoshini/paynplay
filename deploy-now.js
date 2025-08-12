#!/usr/bin/env node

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log(`
🚀 PAY-N-PLAY BOT - AUTOMATED DEPLOYMENT
========================================

I'll guide you through deploying your bot in 5 minutes!

Press Enter to continue...
`);
  await question('');

  console.log(`
STEP 1: UPLOAD TO GITHUB
========================

1. Open this link: https://github.com/new
2. Repository name: paynplay
3. Make it Public
4. Click "Create repository"
5. On the next page, click "uploading an existing file"
6. Drag and drop ALL files from this folder
7. Add commit message: "Initial Pay-n-Play bot"
8. Click "Commit changes"

Your repository URL will be: https://github.com/YOUR_USERNAME/paynplay

Press Enter when you've completed this step...
`);
  await question('');

  console.log(`
STEP 2: DEPLOY TO RAILWAY
=========================

1. Open this link: https://railway.app/
2. Click "Sign up with GitHub"
3. Authorize Railway
4. Click "New Project"
5. Select "Deploy from GitHub repo"
6. Choose your "paynplay" repository
7. Railway will start deploying automatically

Press Enter when Railway starts deploying...
`);
  await question('');

  console.log(`
STEP 3: GET TELEGRAM BOT TOKEN
==============================

1. Open Telegram
2. Message @BotFather
3. Send: /newbot
4. Follow the instructions
5. Copy the token (looks like: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz)

Enter your bot token here: `);
  const botToken = await question('');

  console.log(`
STEP 4: GET GOOGLE SHEET ID
===========================

1. Open your Google Sheet
2. Copy the ID from the URL:
   https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit
3. The SHEET_ID is the long string between /d/ and /edit

Enter your Google Sheet ID here: `);
  const sheetId = await question('');

  console.log(`
STEP 5: CREATE GOOGLE SERVICE ACCOUNT
====================================

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

Press Enter when you have the JSON file...
`);
  await question('');

  console.log(`
STEP 6: EXTRACT SERVICE ACCOUNT VALUES
=====================================

1. Open the downloaded JSON file
2. Find the "client_email" field
3. Copy the email value

Enter the client_email here: `);
  const clientEmail = await question('');

  console.log(`
Now find the "private_key" field in the JSON file.
Copy the entire private key (including the quotes and \\n escapes).

Enter the private_key here: `);
  const privateKey = await question('');

  console.log(`
STEP 7: SHARE GOOGLE SHEET
==========================

1. Open your Google Sheet
2. Click "Share" button
3. Add this email: ${clientEmail}
4. Give it "Editor" permissions
5. Click "Send"

Press Enter when you've shared the sheet...
`);
  await question('');

  console.log(`
STEP 8: SET ENVIRONMENT VARIABLES IN RAILWAY
============================================

1. Go back to Railway dashboard
2. Click on your project
3. Go to "Variables" tab
4. Add these variables:

BOT_TOKEN=${botToken}
SHEET_ID=${sheetId}
GOOGLE_CLIENT_EMAIL=${clientEmail}
GOOGLE_PRIVATE_KEY=${privateKey}

5. Click "Add" for each variable
6. Railway will automatically redeploy

Press Enter when you've added all variables...
`);
  await question('');

  console.log(`
STEP 9: GET YOUR APP URL
========================

1. In Railway dashboard, look for your app URL
2. It will be something like: https://your-app-name.up.railway.app
3. Copy this URL

Enter your Railway app URL here: `);
  const appUrl = await question('');

  console.log(`
STEP 10: SET BASE_URL
=====================

1. In Railway Variables tab
2. Add this variable:
   BASE_URL=${appUrl}
3. Railway will redeploy automatically

Press Enter when you've added BASE_URL...
`);
  await question('');

  console.log(`
🎉 DEPLOYMENT COMPLETE!
=======================

Your bot should now be live! Let's test it:

1. Go to your bot on Telegram
2. Send: /ping
3. It should reply: "pong ✅"

If it works, try: /start

Your bot URL: ${appUrl}
Your bot can now:
- Match buy-ins to cash-outs
- Route payments to owners
- Work with any Google Sheet layout

Need help? Check the logs in Railway dashboard.

Press Enter to exit...
`);
  await question('');

  rl.close();
}

main().catch(console.error);

