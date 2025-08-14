# Partner Onboarding Guide

## Quick Start Checklist

### ✅ Access Granted
- [ ] GitHub repository access
- [ ] Railway project access
- [ ] Google Cloud Platform access
- [ ] Google Sheets access
- [ ] Environment variables shared

### ✅ Local Development Setup
1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/paynplay.git
   cd paynplay
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create `.env` file with:
   ```
   BOT_TOKEN=your_bot_token
   BASE_URL=https://your-app.up.railway.app
   STRIPE_CHECKOUT_URL=https://buy.stripe.com/5kQbJ2gdf2BE9TtbGDc3m07
   SHEET_ID=your_sheet_id
   GOOGLE_CLIENT_EMAIL=your_service_account_email
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ALLOWED_USER_IDS=123456789,987654321
   ```

4. **Build and test locally:**
   ```bash
   npm run build
   npm start
   ```

## Project Overview

### Real-Club Ops Features
- **Multi-tenant configuration** via environment variables
- **Split deposit/withdrawal flows** (circle vs external/owner)
- **Stale withdrawal handling** (automatic marking after 24h)
- **Player ledger system** with `/adjust` and `/balance` commands
- **Admin approval workflows** for withdrawals and payouts

### Key Files
- `src/index.ts` - Main bot logic
- `src/config.ts` - Environment variables and configuration
- `src/sheets.ts` - Google Sheets integration
- `src/matcher.ts` - Payment matching logic
- `Dockerfile` - Production deployment configuration

### Environment Variables
| Variable | Purpose | Required |
|----------|---------|----------|
| `BOT_TOKEN` | Telegram bot token | Yes |
| `BASE_URL` | Railway app URL | Yes |
| `STRIPE_CHECKOUT_URL` | Stripe payment link | No |
| `SHEET_ID` | Google Sheet ID | No |
| `GOOGLE_CLIENT_EMAIL` | Service account email | No |
| `GOOGLE_PRIVATE_KEY` | Service account key | No |
| `ALLOWED_USER_IDS` | Admin user IDs | Yes |

## Deployment

### Railway Deployment
1. **Push changes to GitHub**
2. **Railway automatically deploys** (1-2 minutes)
3. **Check logs** in Railway dashboard
4. **Verify bot is running** by sending `/ping` to bot

### Local Testing
1. **Run `npm run build`** to compile TypeScript
2. **Run `npm start`** to start bot locally
3. **Test with Telegram** by messaging the bot

## Common Tasks

### Adding New Payment Methods
1. **Update `METHODS_CIRCLE`** in environment variables
2. **Update `METHODS_EXTERNAL_LINK`** in environment variables
3. **Add owner accounts** to Google Sheets or environment variables
4. **Redeploy** to Railway

### Managing Admin Users
1. **Update `ALLOWED_USER_IDS`** in Railway environment variables
2. **Redeploy** to apply changes
3. **Test with `/adjust` command**

### Setting Up Google Sheets
1. **Create new Google Sheet**
2. **Add required tabs** (see `GOOGLE_SHEETS_SETUP.md`)
3. **Share with service account**
4. **Update `SHEET_ID`** in Railway

## Troubleshooting

### Bot Not Responding
1. **Check Railway logs** for errors
2. **Verify `BOT_TOKEN`** is correct
3. **Check webhook URL** in Telegram
4. **Restart deployment** if needed

### Build Failures
1. **Check TypeScript errors** in build logs
2. **Verify all imports** have `.js` extensions
3. **Check environment variables** are set correctly

### Google Sheets Errors
1. **Verify service account** has access
2. **Check sheet ID** is correct
3. **Ensure required tabs** exist
4. **Check API quotas** in Google Cloud Console

## Support Contacts

- **GitHub Issues:** Create issues in the repository
- **Railway Support:** Use Railway dashboard support
- **Google Cloud:** Use Google Cloud Console support
- **Telegram Bot API:** Check @BotFather for bot issues

## Security Notes

- **Never commit** environment variables to Git
- **Use secure channels** for sharing secrets
- **Regularly rotate** service account keys
- **Monitor access logs** in Google Cloud Console
- **Use strong passwords** for all accounts
