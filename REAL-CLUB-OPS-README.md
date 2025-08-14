# Real-Club Ops Multi-Tenant Implementation

This document describes the real-club ops multi-tenant system implementation for deposits/withdrawals split, owner payouts, stale handling, and ledger functionality.

## Overview

The real-club ops system provides a comprehensive multi-tenant solution for managing club operations with the following key features:

- **Deposits**: Circle-matching for Venmo/Zelle, external links for Card/Cash App/Apple Pay
- **Withdrawals**: Circle queue for Venmo/Zelle, owner payouts for PayPal/Crypto
- **Stale Handling**: Automatic marking of stale Cash App withdrawals
- **Ledger**: Player balance tracking with adjustment capabilities
- **Multi-Tenant**: All behavior configurable via environment variables and Settings sheet

## Environment Variables

### Required for Real-Club Ops

```bash
# Circle matching methods (comma-separated)
METHODS_CIRCLE=VENMO,ZELLE

# External link methods (comma-separated)
METHODS_EXTERNAL_LINK=CARD,CASHAPP,APPLEPAY

# Stripe checkout URL (optional)
STRIPE_CHECKOUT_URL=https://checkout.stripe.com/...

# Stale withdrawal hours
WITHDRAW_STALE_HOURS=24

# Fixed wallets for owner payouts (JSON)
FIXED_WALLETS_JSON={"PAYPAL":"ConnorRobinson794","BTC":"bc1...","ETH":"0x2f26..."}

# Dev bypass for testing
DEV_BYPASS_ID=123456789
```

### Example Fixed Wallets JSON

```json
{
  "PAYPAL": "ConnorRobinson794",
  "BTC": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  "ETH": "0x2f26f6b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8",
  "LTC": "ltc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  "USDT_ERC20": "0x2f26f6b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8",
  "USDT_TRC20": "TCA6f6b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8",
  "XRP": "rNohT6f6b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8",
  "SOL": "Djw27f6b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8"
}
```

## Google Sheets Structure

### New Sheets Created

The system automatically creates the following sheets with proper headers:

#### Withdrawals
- `request_id` | `user_id` | `username` | `amount_usd` | `method` | `payment_tag_or_address` | `request_timestamp_iso` | `approved_by_user_id` | `approved_at_iso` | `status` | `payout_type` | `notes`

#### OwnerPayouts
- `payout_id` | `user_id` | `username` | `amount_usd` | `channel` | `owner_wallet_or_handle` | `request_timestamp_iso` | `approved_by_user_id` | `approved_at_iso` | `status` | `notes`

#### ExternalDeposits
- `entry_id` | `user_id` | `username` | `amount_usd` | `method` | `reference` | `created_at_iso` | `recorded_by_user_id`

#### PlayerLedger
- `user_id` | `username` | `balance_cents` | `updated_at_iso` | `note`

### Settings Sheet Overrides

Add these keys to your Settings sheet to override environment variables:

| Key | Description | Example |
|-----|-------------|---------|
| `STRIPE_CHECKOUT_URL` | Stripe checkout URL | `https://checkout.stripe.com/...` |
| `METHODS_CIRCLE` | Circle matching methods | `VENMO,ZELLE` |
| `METHODS_EXTERNAL_LINK` | External link methods | `CARD,CASHAPP,APPLEPAY` |
| `WITHDRAW_STALE_HOURS` | Stale withdrawal hours | `24` |

## User Workflows

### Deposits

#### Circle Methods (Venmo/Zelle)
1. User selects Venmo or Zelle
2. System matches with oldest withdrawal in queue (payout_type='CIRCLE')
3. User pays the matched withdrawal recipient
4. Admin confirms payment

#### External Link Methods (Card/Cash App/Apple Pay)
1. User selects Card, Cash App, or Apple Pay
2. System shows Stripe checkout link
3. User can optionally log external deposit
4. No circle matching occurs

### Withdrawals

#### Circle Withdrawals (Venmo/Zelle)
1. User selects Venmo or Zelle
2. User enters amount and payment tag
3. Request queued in Withdrawals (payout_type='CIRCLE')
4. Admin confirms withdrawal
5. Withdrawal available for circle matching

#### Owner Payouts (PayPal/Crypto)
1. User selects PayPal or Crypto
2. For crypto, user selects coin and enters wallet address
3. Request created in OwnerPayouts and mirrored in Withdrawals (payout_type='OWNER')
4. Admin marks as paid when owner completes payout

### Stale Handling

- Cash App circle withdrawals older than `WITHDRAW_STALE_HOURS` are automatically marked as 'STALE'
- Stale sweeper runs every 10 minutes
- Admin can resolve stale withdrawals manually

### Ledger Commands

#### `/adjust <user_id> <+/-amount> <note>`
- Adjusts a player's balance
- Requires authorization
- Updates PlayerLedger sheet

#### `/balance [user_id]`
- Shows current balance
- Without user_id: shows own balance
- With user_id: requires authorization

## Admin Functions

### Authorization
- All admin functions use `isAuthorized()` function
- Supports `ALLOWED_USER_IDS` environment variable
- Supports `DEV_BYPASS_ID` for testing
- Dev bypass activates when no allowed users configured

### Confirmation Buttons
- **Circle Withdrawals**: "✅ Confirm Withdrawal" button
- **Owner Payouts**: "✅ Mark Owner Paid" button
- Both require authorization

## Technical Implementation

### Key Files Modified

1. **`src/config.ts`**: Added new environment variables and authorization helper
2. **`src/sheets.ts`**: Added new sheet functions and updated Settings type
3. **`src/matcher.ts`**: Updated to use circle withdrawals for matching
4. **`src/index.ts`**: Added new handlers and updated existing flows

### New Functions

#### Sheets Functions
- `appendWithdrawalRow()`: Add withdrawal to queue
- `updateWithdrawalStatus()`: Update withdrawal status
- `appendOwnerPayout()`: Create owner payout
- `markOwnerPayoutPaid()`: Mark owner payout as paid
- `appendExternalDeposit()`: Log external deposit
- `upsertLedger()`: Update player balance
- `getLedgerBalance()`: Get player balance
- `markStaleCashAppCircleWithdrawals()`: Mark stale withdrawals

#### Authorization
- `isAuthorized(userId)`: Check if user is authorized
- Supports dev bypass when no users configured

### Session Management

Extended session data includes:
- `payoutType`: 'CIRCLE' or 'OWNER'
- `channel`: Payment channel (PAYPAL, CRYPTO, etc.)
- `cryptoCoin`: Selected crypto currency
- `cryptoAddress`: User's wallet address
- `externalAmount`: External deposit amount
- `externalReference`: External deposit reference

## Testing

Run the test script to verify configuration:

```bash
node test-real-club-ops.js
```

## Deployment

1. Set environment variables
2. Ensure Google Sheets permissions
3. Deploy bot
4. Test workflows

## Multi-Tenant Configuration

Each client can be configured independently via:
- Environment variables (defaults)
- Settings sheet (overrides env)
- No code changes required per client

## Security Features

- Rate limiting on all user inputs
- Authorization checks on admin functions
- Input validation and sanitization
- Audit logging for security events
- Session timeout management

## Monitoring

- Stale sweeper logs
- Cache refresh logs
- Security event logs
- Error handling and fallbacks

## Troubleshooting

### Common Issues

1. **Circle matching not working**: Check METHODS_CIRCLE configuration
2. **External links not showing**: Check STRIPE_CHECKOUT_URL
3. **Authorization failing**: Check ALLOWED_USER_IDS or DEV_BYPASS_ID
4. **Sheets not updating**: Check Google Sheets permissions

### Debug Commands

- `/ping`: Health check
- `/balance`: Check balance
- `/adjust`: Adjust balance (admin only)

## Future Enhancements

- Username resolution for @mentions
- Advanced crypto validation
- Bulk operations
- Reporting and analytics
- Webhook integrations
