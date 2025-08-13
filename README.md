# Pay-n-Play Telegram Bot

A production-ready Telegram bot that routes buy-ins to either pending cash-outs from a Google Sheet (instant match) or the club owner (fallback).

## Features

- **Client-proof**: Works with any existing Google Sheet layout
- **Smart matching**: Matches buy-ins to pending cash-outs by amount and payment method
- **Flexible deployment**: Supports webhook on Railway and long polling locally
- **Owner fallback**: Routes to owner when no match is found or amount exceeds threshold

## Tech Stack

- Node 20, TypeScript, ESM
- grammy for Telegram bot
- express for webhook server
- googleapis (Sheets v4) for Google Sheets integration
- npm package manager

## Environment Variables

### Required

- `BOT_TOKEN` - Telegram bot token from BotFather
- `SHEET_ID` - Google Sheet ID (the long ID in the URL)
- `GOOGLE_CLIENT_EMAIL` - Google service account client email
- `GOOGLE_PRIVATE_KEY` - Google service account private key (single line with \n escapes)

### Optional (with defaults)

- `BASE_URL` - e.g., https://<app>.up.railway.app (when present, use webhook; else long polling)
- `PORT` - default 8080
- `METHODS_ENABLED_DEFAULT` - e.g., ZELLE,VENMO
- `CURRENCY_DEFAULT` - default USD
- `FAST_FEE_PCT_DEFAULT` - default 0.02
- `OWNER_FALLBACK_THRESHOLD` - default 999999 (send to owner when amount ≥ this or no match)
- `OWNER_TG_USERNAME` - default blank (optional)

### Owner handles (for fallback if no dedicated sheet)

- `ZELLE_HANDLE`
- `VENMO_HANDLE`
- `CASHAPP_HANDLE` (optional)

## Setup Instructions

### 1. Create a Google Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google Sheets API
4. Go to "APIs & Services" > "Credentials"
5. Click "Create Credentials" > "Service Account"
6. Download the JSON key file
7. Extract `client_email` and `private_key` from the JSON

### 2. Create a Telegram Bot

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot` and follow instructions
3. Copy the bot token

### 3. Prepare Google Sheet

1. Create a new Google Sheet or use existing one
2. Share the sheet with your service account email (with Editor permissions)
3. Copy the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`

### 4. Local Development

```bash
# Install dependencies
npm install

# Set environment variables (create .env file)
cp .env.example .env
# Edit .env with your values

# Run in development mode
npm run dev
```

### 5. Railway Deployment

1. Connect your GitHub repo to Railway
2. Set environment variables in Railway dashboard:
   - All required variables above
   - Set `BASE_URL` to your Railway app URL (e.g., https://your-app.up.railway.app)

3. Deploy using Nixpacks (automatic)

4. After deployment, verify webhook:
   ```bash
   curl https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo
   ```
   Should show webhook URL pointing to `BASE_URL/<BOT_TOKEN>`

## Usage

### Bot Commands

- `/start` - Welcome message with Buy-In button
- `/ping` - Health check (returns "pong ✅")

### User Flow

1. User sends `/start`
2. Bot shows welcome message with "💸 Buy-In" button
3. User clicks Buy-In → shows payment methods
4. User selects method → shows amount options ($25, $50, $75, $100, $200, Custom)
5. User selects amount → bot tries to match with pending cash-out
6. If matched: shows receiver handle + "✅ Mark Paid" button
7. If not matched: routes to owner + "✅ Mark Paid" button

## Google Sheet Layout

The bot is client-proof and works with various sheet layouts:

### Settings Tab (Optional)
If present, should have columns:
- `key` | `value`
- `CLUB_NAME` | Your Club Name
- `METHODS_ENABLED` | ZELLE,VENMO
- `CURRENCY` | USD
- `FAST_FEE_PCT` | 0.02
- `OWNER_FALLBACK_THRESHOLD` | 999999
- `OWNER_TG_USERNAME` | username

### OwnerAccounts Tab (Optional)
If present, should have columns:
- `method` | `handle` | `display_name` | `instructions`
- `ZELLE` | `your@email.com` | `Owner` | `Include note with payment`

### Cashouts Tab (Optional)
If present, should have columns:
- `cashout_id` | `method` | `amount` | `status` | `receiver_handle`

### Fallback: First Sheet
If no dedicated tabs, bot infers from first sheet:
- Looks for columns: Transaction Type, Payment Method, Amount, Status
- Treats rows with "cash out" in Transaction Type as cash-outs
- Treats empty/pending/open Status as pending

## Troubleshooting

### Common Errors

**400 "Unable to parse range"**
- Missing tab; auto-fallback should handle this
- Check sheet permissions

**403 Permission denied**
- Share sheet with service account email
- Ensure service account has Editor permissions

**502 from Telegram**
- Check Railway logs
- Often indicates Sheets API error
- Verify all environment variables are set

### Manual Testing

1. Hit `/` → should return "OK"
2. Send `/ping` in Telegram → should return "pong ✅"
3. Send `/start` → should show welcome + Buy-In button
4. Complete buy-in flow → should either match or route to owner

## Development

```bash
# Build TypeScript
npm run build

# Start production server
npm start

# Development with hot reload
npm run dev
```

## Architecture

- `src/config.ts` - Environment variables and configuration
- `src/messages.ts` - All user-facing strings
- `src/types.ts` - TypeScript type definitions
- `src/sheets.ts` - Google Sheets integration (client-proof)
- `src/matcher.ts` - Matching logic for buy-ins to cash-outs
- `src/index.ts` - Main bot logic and Express server

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details
