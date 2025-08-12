# 🚀 Quick Start - Deploy in 5 Minutes

## The Fastest Way to Get Your Bot Running

### 1. Upload to GitHub (2 minutes)
1. Go to https://github.com/new
2. Create repository named "paynplay"
3. Upload all files from this folder
4. Commit

### 2. Deploy to Railway (1 minute)
1. Go to https://railway.app/
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your paynplay repository

### 3. Get Required Values (2 minutes)
While Railway deploys, get these values:

#### Telegram Bot Token:
- Message @BotFather on Telegram
- Send `/newbot`
- Copy the token

#### Google Sheet ID:
- Open your Google Sheet
- Copy ID from URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`

#### Google Service Account:
- Go to https://console.cloud.google.com/
- Create project → Enable Sheets API → Create Service Account
- Download JSON key → Extract `client_email` and `private_key`
- Share your sheet with the `client_email`

### 4. Set Environment Variables (1 minute)
In Railway dashboard → Variables tab, add:

```
BOT_TOKEN=8371207779:AAFDwC55jeLZXgBa2A-MdcuKSGpvX6y69cY
SHEET_ID=your_sheet_id_here
GOOGLE_CLIENT_EMAIL=paynplayai@stoked-aloe-468800-d8.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDpS6o/LepVSdEOLtiSBI48ESowGGTFWSFxkLHZJGj7c2qztFYrVlPujeIxDz3tDuUySPPxZSmpDQs1Xrx64UChrFAAAgcfRinvMQ8f12dTaldyMm3Rhl+Fas7FOcxnx6kN7qgN78lXNQ6dQVMdVSwoDkUqT1YQPDuGn+PILHJwjM+NqHkyA6xvoorDp8i8Z99yxCDh1n70QTwYdFDV16IphEd8A7tdx1oUlGrdoeXyMU3N9FW93G0c0QWIGwshSPPNiQRmn1aeQ1TdYklfc7E0sum68GDqjko4rSnyivsSebFgtraWSXcQTdAXhCbhVoP38Y7ch8Iw+IYCBecGh7ydAgMBAAECggEAOGaWjheno17pL6ibqxF24Ya00FPVaPCXaUE1/e0ThFbu4OskOe3w9KdQm9O3gOws9O82KpHudHQ21XxFzN9QJMXnwVi8KA9qa+1MXsJQtJXs9irC6fi2dybPPlcu15gpgrjD4DqsTm0BT3tPgLPqrPRmPEhZ4irtqSpWgzpboGG0THtx+BzHIW9Xj7ehoqgyaJPsOlPRBTS5jRut83iuWKI0TN+z7PWN2kUP76ERuCy0o4pCGi2MV403PKwl7nKcME13tWCY1bju4lOYA4Gy4cUZove5c/IPdWYEOQ3VAsWqjfHEW4kbV/gnX8tPSLhdNW7DcAWNUJKLBAXg41s+gQKBgQD4+MEcTU1MCGBgUH1Nr+8V5qY1c0ODHXArCgwzNKZH8sOMQ0wUbg5oJgMNJAlbc6v3ispTeqAG5C/by3u7lUjeHjPwtfkWECyIK41Z1awDHRZdWYI26eQ/PJogcMA92E7q7mSzp/e3wmJLtNy2qVPn3dfpn2SqG6PdXYCnXQccNQKBgQDv4Z+2iuWRnaMYTdKgXjMIvjtxTynGwuHj+r0/tBY+NTFd2Iw1LTn3TI6+yc1B5PwtvDvzEUhQrn1gpFTQkkK9jAR7okvtmNqN82Qu0122cCe05xA/6uRIx6KvCjFnMdnmxJbet43OiinUyT5MzQ2Q08h0uKEZ7FuEJlkXcTUbyQKBgQDpF5NMWP8OOSVp5tF5Y0a2vWtMzW4emfgDA3QqmJc48wqrDfJzihpI3ZWrvtpX2XLd3f3QrBSYfxhjch2UoI5JDgPYz7W1N01J62R5/7b8b0YZ/YwQt2du4OD3kDgbbqFsB+cV4CLm0sFOWbTt+pfIlATp/8WyERCYVkr15f2bJQKBgBwE56njyXLbzdwd4vdWaXGg/sJ6c6/Cva3qcMaLG3oCrpR+ocnoUXgAWkAQxEfpHkedUAdRQngiGYT7TOjb3K3VOATU7TeAfi7Meiw6Bh00Nn8b6jr9DdMudmMptqGOIhyhY9n56LdyTfaL1xoTbX04L5bqpe6oO/xQmmFxmLl5AoGBAJ6patu7+69YtN949m/BUwoH1+r2No3xlWXWH0HwxIW2MBfD4LM/s+/NVbpifKMJRz9AvtlYwN/NBp3se8hv0B9A3XRjae/mtvnplDGuxHRxsZTBA7OUzCcBt9sFsRaQgvH0Q8x1gvaq38ogO1Xax/ntyS5qJMRS7mmzMCmZYG9U\n-----END PRIVATE KEY-----\n"
BASE_URL=https://paynplay-production.up.railway.app
```

### 5. Test Your Bot
- Railway will show your app URL
- Send `/ping` to your bot on Telegram
- Should reply "pong ✅"

## That's it! Your bot is live! 🎉

## Need Help?
- Check `DEPLOYMENT.md` for detailed instructions
- Run `node setup-helper.js` for step-by-step guidance
- Check Railway logs if something goes wrong

## What Your Bot Can Do:
- `/start` - Welcome message with Buy-In button
- `/ping` - Health check
- Smart matching of buy-ins to cash-outs
- Automatic routing to owner when no match
- Works with any Google Sheet layout

