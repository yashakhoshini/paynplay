# Google Cloud Service Account Verification Guide

## Quick Verification Steps

### 1. Check Your Google Cloud Project
Go to [https://console.cloud.google.com/home/dashboard?project=stoked-aloe-468800-d8](https://console.cloud.google.com/home/dashboard?project=stoked-aloe-468800-d8)

### 2. Verify Service Account Exists
1. In Google Cloud Console, go to **IAM & Admin** > **Service Accounts**
2. Look for a service account (usually named something like `paynplay-bot` or `sheets-service`)
3. Note the **Service Account Email** (ends with `@stoked-aloe-468800-d8.iam.gserviceaccount.com`)

### 3. Check API Enablement
1. Go to **APIs & Services** > **Library**
2. Search for "Google Sheets API"
3. Make sure it shows **API enabled** (green checkmark)

### 4. Verify Service Account Key
1. In **Service Accounts**, click on your service account
2. Go to **Keys** tab
3. Check if you have a **JSON key** downloaded
4. If not, create a new key:
   - Click **Add Key** > **Create new key**
   - Choose **JSON** format
   - Download the file

### 5. Check Sheet Permissions
1. Open your Google Sheet: [https://docs.google.com/spreadsheets/d/1Xs-4ZIpt87XcS6rBCtXkczSB0hLUExK1/edit](https://docs.google.com/spreadsheets/d/1Xs-4ZIpt87XcS6rBCtXkczSB0hLUExK1/edit)
2. Click **Share** button (top right)
3. Add your service account email with **Editor** permissions
4. Make sure to uncheck "Notify people" to avoid sending an email

## Environment Configuration

### Create .env File
Create a `.env` file in your project root with:

```bash
# Google Sheets Configuration
SHEET_ID=1Xs-4ZIpt87XcS6rBCtXkczSB0hLUExK1
GOOGLE_CLIENT_EMAIL=your-service-account@stoked-aloe-468800-d8.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour actual private key here\n-----END PRIVATE KEY-----\n"

# Other required settings
BOT_TOKEN=your_telegram_bot_token
CLIENT_NAME=Your Club Name
CLIENT_ID=your_club_id
```

### Extract Private Key
1. Open your downloaded JSON key file
2. Copy the `private_key` value
3. Replace `\n` with actual newlines or use the format above
4. Make sure to include the quotes around the entire key

## Run Verification Script

```bash
node verify-google-cloud-setup.js
```

This will test:
- ✅ Environment variables are set
- ✅ Service account authentication works
- ✅ Google Sheets API access
- ✅ Sheet permissions (read/write)
- ✅ Bot can access your specific sheet

## Common Issues & Solutions

### Issue: "Service account not found"
**Solution:**
1. Create a new service account in Google Cloud Console
2. Enable Google Sheets API
3. Create and download a new JSON key
4. Update your .env file

### Issue: "API not enabled"
**Solution:**
1. Go to APIs & Services > Library
2. Search for "Google Sheets API"
3. Click "Enable"

### Issue: "Permission denied"
**Solution:**
1. Share your Google Sheet with the service account email
2. Give "Editor" permissions (not just Viewer)
3. Make sure the sheet ID is correct

### Issue: "Invalid credentials"
**Solution:**
1. Download a fresh JSON key from the service account
2. Make sure the private key is properly formatted in .env
3. Check that the client_email matches exactly

## Testing Your Setup

After fixing any issues, run:

```bash
# Test Google Cloud setup
node verify-google-cloud-setup.js

# Test bot functionality
node test-google-sheets-access.js

# Start the bot
npm start
```

## Expected Results

When everything is working correctly, you should see:
- ✅ All verification tests pass
- ✅ Bot can read/write to your Google Sheet
- ✅ Withdrawals tab is accessible
- ✅ Service account authentication successful

## Next Steps

Once verified:
1. Test the bot with real withdrawal requests
2. Monitor the Google Sheet for new entries
3. Verify the bot can update withdrawal statuses
4. Test the matching logic with deposits

## Support

If you're still having issues:
1. Check the Google Cloud Console for any error messages
2. Verify your service account has the correct roles
3. Make sure your Google Sheet has the required tabs and columns
4. Test with a simple Google Sheets API call first
