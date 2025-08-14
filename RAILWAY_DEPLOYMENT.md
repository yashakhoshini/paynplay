# Railway Deployment Guide

## Quick Setup

### Option 1: Using Dockerfile (Recommended)
1. **Push your code** with the new Dockerfile
2. **Railway will automatically detect** the Dockerfile and use it
3. **Set environment variables** in Railway dashboard:
   ```
   BOT_TOKEN=your_bot_token
   BASE_URL=https://your-app.up.railway.app
   STRIPE_CHECKOUT_URL=https://buy.stripe.com/5kQbJ2gdf2BE9TtbGDc3m07
   ```

### Option 2: Using Nixpacks (No Dockerfile)
If you prefer not to use Dockerfile, set these in Railway:

**Build Command:**
```bash
npm ci --include=dev && npm run build
```

**Start Command:**
```bash
node dist/index.js
```

**Environment Variables:**
```
NPM_CONFIG_PRODUCTION=false
BOT_TOKEN=your_bot_token
BASE_URL=https://your-app.up.railway.app
STRIPE_CHECKOUT_URL=https://buy.stripe.com/5kQbJ2gdf2BE9TtbGDc3m07
```

## What This Fixes

✅ **"tsc: Permission denied"** - Uses `node ./node_modules/typescript/bin/tsc`
✅ **DevDependencies missing** - Multi-stage build includes devDeps in builder
✅ **Build reliability** - Proper separation of build and runtime
✅ **Production optimization** - Runtime image only has production dependencies

## Expected Build Time
- **1-2 minutes** for initial build
- **30-60 seconds** for subsequent deployments

## No Google Sheets Required
The bot will work perfectly without Google Sheets configured. All real-club ops features will use environment variables and in-memory storage.

## Troubleshooting

If you still see build errors:
1. **Check Railway logs** for specific error messages
2. **Verify environment variables** are set correctly
3. **Ensure BOT_TOKEN** is valid and not empty
4. **Check BASE_URL** matches your Railway app URL

## Success Indicators
- Build completes without "permission denied" errors
- Bot starts and shows "✓ Bot token validated successfully"
- Webhook is set successfully
- No Google Sheets retry errors (if SHEET_ID not set)
