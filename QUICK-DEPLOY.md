# Quick Deploy Reference

## One-Time Setup

### 1. Install Railway CLI
```bash
npm install -g @railway/cli
railway login
```

### 2. Create Google Service Account
1. Go to https://console.cloud.google.com
2. Create project or select existing
3. Enable Google Sheets API
4. Create service account
5. Download JSON credentials
6. **Save the credentials** - you'll use them for all clubs

## Deploy New Club (5 minutes)

### Step 1: Get Client Info
Ask client for:
- Bot token (from @BotFather)
- Google Sheet URL
- Telegram group chat ID
- List of loader user IDs

### Step 2: Deploy
**Windows:**
```cmd
deploy-club.bat pokerclub 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms -1001234567890 123456789,987654321
```

**Mac/Linux:**
```bash
./deploy-club.sh pokerclub 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms -1001234567890 123456789,987654321
```

### Step 3: Set Google Credentials
1. Go to Railway dashboard
2. Find the new service
3. Go to Variables tab
4. Set:
   - `GOOGLE_CLIENT_EMAIL` = service account email
   - `GOOGLE_PRIVATE_KEY` = private key from JSON

### Step 4: Test
1. Message bot: `/ping`
2. Should respond: "pong ✅"
3. Test buy-in flow
4. Check loader group for transaction cards

## Environment Variables Reference

| Variable | Required | Example |
|----------|----------|---------|
| `BOT_TOKEN` | ✅ | `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz` |
| `SHEET_ID` | ✅ | `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms` |
| `GOOGLE_CLIENT_EMAIL` | ✅ | `bot@project.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | ✅ | `-----BEGIN PRIVATE KEY-----\n...` |
| `LOADER_GROUP_ID` | ✅ | `-1001234567890` |
| `ALLOWED_USER_IDS` | ✅ | `123456789,987654321` |
| `BASE_URL` | ❌ | `https://pokerclub.up.railway.app` |
| `PORT` | ❌ | `8080` |

## Troubleshooting

### Bot Not Responding
```bash
# Check webhook
curl https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo
```

### Sheet Access Issues
- Share sheet with service account email
- Check sheet ID is correct

### Group Messages Not Working
- Verify group chat ID format (should be negative number)
- Ensure bot is added to group

## Cost Estimate
- Railway: ~$5-20/month per club
- Google Sheets API: Free tier (generous)
- Total: ~$5-20/month per club

## Maintenance

### Update All Clubs
When you update the template repository:
1. Go to each Railway service
2. Click "Redeploy"
3. Or use Railway CLI: `railway up`

### Monitor All Clubs
- Each service has its own logs
- Set up alerts for each service
- Check webhook health regularly
