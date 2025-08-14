# Google Sheets Setup for Real-Club Ops Bot

## Required Tabs

The bot needs these tabs in your Google Sheet:

### 1. OwnerAccounts
**Headers (Row 1):**
```
method | handle | display_name | instructions
```

**Example Data:**
```
VENMO | @yourvenmo | Owner | Include note with payment
ZELLE | your@email.com | Owner | Include note with payment
CASHAPP | $yourcashapp | Owner | Include note with payment
PAYPAL | your@paypal.com | Owner | Include note with payment
```

### 2. Withdrawals
**Headers (Row 1):**
```
request_id | user_id | username | amount_usd | method | payment_tag_or_address | request_timestamp_iso | status | payout_type | confirmed_by_user_id | confirmed_timestamp_iso | notes
```

**Example Data:**
```
wd_1234567890_abc123 | 123456789 | @username | 100 | VENMO | @userhandle | 2025-08-14T02:00:00.000Z | QUEUED | CIRCLE | | | 
```

### 3. OwnerPayouts
**Headers (Row 1):**
```
payout_id | user_id | username | amount_usd | channel | owner_wallet_or_handle | request_timestamp_iso | status | paid_by_user_id | paid_timestamp_iso | notes
```

**Example Data:**
```
op_1234567890_abc123 | 123456789 | @username | 100 | PAYPAL | owner@paypal.com | 2025-08-14T02:00:00.000Z | QUEUED | | | 
```

### 4. ExternalDeposits
**Headers (Row 1):**
```
entry_id | user_id | username | amount_usd | method | reference | created_at_iso | recorded_by_user_id
```

**Example Data:**
```
ext_1234567890_abc123 | 123456789 | @username | 100 | EXTERNAL | Stripe payment | 2025-08-14T02:00:00.000Z | 123456789
```

### 5. PlayerLedger
**Headers (Row 1):**
```
user_id | username | balance_cents | last_updated_iso
```

**Example Data:**
```
123456789 | @username | 10000 | 2025-08-14T02:00:00.000Z
```

## Setup Steps

1. **Create a new Google Sheet** or use existing one
2. **Add the tabs** with exact names above
3. **Add the headers** in row 1 of each tab
4. **Set up Google Service Account**:
   - Go to Google Cloud Console
   - Create a service account
   - Download the JSON key
   - Share the Google Sheet with the service account email

5. **Set Environment Variables**:
   ```
   SHEET_ID=your_sheet_id_here
   GOOGLE_CLIENT_EMAIL=your_service_account_email
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

## Quick Setup Script

You can also create these tabs programmatically using the Google Sheets API, but manual setup is simpler for most users.

## Troubleshooting

- **"Unable to parse range"**: Tab doesn't exist or has wrong name
- **"Permission denied"**: Service account doesn't have access
- **"Invalid credentials"**: Check GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY
