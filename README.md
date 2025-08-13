# Pay-n-Play Telegram Bot

A production-ready Telegram bot that routes buy-ins to either pending cash-outs from a Google Sheet (instant match) or the club owner (fallback).

## Features

- **Client-proof**: Works with any existing Google Sheet layout
- **Smart matching**: Matches buy-ins to pending cash-outs by amount and payment method
- **Min $20 remainder rule**: Ensures partial settlements leave either $0 or ≥$20 remaining
- **Group workflow**: Posts transaction cards to loader group for verification
- **Restricted Mark Paid**: Only owners/loaders can confirm payments
- **ClubGG integration**: Optional webhook for auto-loading chips
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

### Group workflow settings

- `LOADER_GROUP_ID` - Numeric Telegram chat ID for the loader/owner group (required)
- `OWNER_IDS` - Comma-separated Telegram user IDs who count as owners
- `LOADER_IDS` - Comma-separated Telegram user IDs who count as loaders
- `BOT_USERNAME` - Bot username (without @), used in group mentions
- `CLUBGG_WEBHOOK_URL` - Optional URL to call after Mark Paid for auto-loading
- `PRIVACY_HINTS_ENABLED` - "true"/"false" (default "true") to post reminders in groups

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

### 4. Set up Group Workflow

1. **Create a loader group** in Telegram (owners + loaders + optional players)
2. **Add the bot** to the group
3. **Get the group ID**: Send a message in the group and visit `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates` to find the `chat.id`
4. **Set LOADER_GROUP_ID** to the numeric group ID (usually negative number like `-1001234567890`)
5. **Configure OWNER_IDS and LOADER_IDS** with comma-separated Telegram user IDs
6. **Set BOT_USERNAME** to your bot's username (without @)

**Optional**: Disable privacy mode in BotFather (`/setprivacy` → "Turn off") to allow the bot to see non-command messages in groups for better onboarding.

### 5. Local Development

```bash
# Install dependencies
npm install

# Set environment variables (create .env file)
cp .env.example .env
# Edit .env with your values

# Run in development mode
npm run dev
```

### 6. Railway Deployment

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

1. User sends `/start` (in DM or group)
2. Bot shows welcome message with "💸 Buy-In" button
3. User clicks Buy-In → shows payment methods
4. User selects method → shows amount options ($25, $50, $75, $100, $200, Custom)
5. User selects amount → bot tries to match with pending cash-out
6. Bot replies to player with payment instructions
7. Bot posts transaction card to loader group with "✅ Mark Paid" button
8. Player posts screenshot proof in group
9. Loader/Owner clicks "✅ Mark Paid" to confirm payment
10. Sheet is updated and ClubGG webhook is called (if configured)

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

### Roles Sheet (Optional)
If a tab named "Roles" exists with headers:
- `tg_user_id` (number) - Telegram user ID
- `role` (owner|loader) - User role
- `display_name` (optional) - Display name

These roles are merged with environment variables (sheet takes precedence).

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
4. Complete buy-in flow → should post to loader group
5. Test Mark Paid authorization → only privileged users can confirm
6. Add bot to group → should post welcome message

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
