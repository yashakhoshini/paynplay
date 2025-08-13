@echo off
setlocal enabledelayedexpansion

echo 🧪 Setting up Development Environment for Testing
echo.

echo This script sets up a development environment for testing the bot
echo without real clients. It will create a test service with dummy values.
echo.

set /p CONFIRM="Do you want to continue? (y/N): "
if /i not "%CONFIRM%"=="y" (
    echo Setup cancelled.
    exit /b 0
)

echo.
echo Creating development service...

REM Check if Railway CLI is installed
railway --version >nul 2>&1
if errorlevel 1 (
    echo Error: Railway CLI is not installed. Please install it first:
    echo npm install -g @railway/cli
    echo railway login
    exit /b 1
)

echo Creating Railway service for development...
railway service create paynplay-dev
if errorlevel 1 (
    echo Error: Failed to create Railway service
    echo This might happen if the service name already exists.
    echo Try deleting the existing service or use a different name.
    exit /b 1
)
echo ✓ Service created
echo.

echo Setting up development environment variables...

REM Dummy values for testing (you'll need to replace these with real values)
railway variables set BOT_TOKEN="1234567890:DUMMY_BOT_TOKEN_FOR_TESTING"
railway variables set SHEET_ID="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
railway variables set LOADER_GROUP_ID="-1001234567890"
railway variables set OWNER_IDS="123456789,987654321"
railway variables set LOADER_IDS="111222333,444555666"
railway variables set ALLOWED_USER_IDS="123456789,987654321,111222333,444555666"

REM Client identification
railway variables set CLIENT_NAME="paynplay-dev"
railway variables set CLIENT_ID="dev"

REM Service URL and webhook
railway variables set BASE_URL="https://paynplay-dev.up.railway.app"
railway variables set PORT="8080"

REM Payment methods and defaults
railway variables set METHODS_ENABLED_DEFAULT="ZELLE,VENMO,CASHAPP,PAYPAL"
railway variables set CURRENCY_DEFAULT="USD"
railway variables set FAST_FEE_PCT_DEFAULT="0.02"
railway variables set OWNER_FALLBACK_THRESHOLD="100"

REM Security and performance settings
railway variables set MAX_BUYIN_AMOUNT="10000"
railway variables set MIN_BUYIN_AMOUNT="20"
railway variables set SHEETS_RATE_LIMIT_MS="1000"
railway variables set SESSION_TIMEOUT_MS="300000"
railway variables set MAX_MESSAGE_LENGTH="4096"
railway variables set PRIVACY_HINTS_ENABLED="true"

echo ✓ Development environment variables set
echo.

echo ⚠️  IMPORTANT: You need to replace these dummy values with real ones:
echo.
echo 1. BOT_TOKEN - Get a real bot token from @BotFather
echo 2. SHEET_ID - Use a real Google Sheet ID
echo 3. LOADER_GROUP_ID - Use a real Telegram group ID
echo 4. OWNER_IDS/LOADER_IDS - Use real Telegram user IDs
echo 5. GOOGLE_CLIENT_EMAIL - Your service account email
echo 6. GOOGLE_PRIVATE_KEY - Your service account private key
echo.
echo To update these values:
echo 1. Go to Railway dashboard: https://railway.app/dashboard
echo 2. Find the "paynplay-dev" service
echo 3. Go to Variables tab
echo 4. Update the values
echo.

echo Deploying development service...
railway up
if errorlevel 1 (
    echo Error: Deployment failed
    echo Check Railway logs for details
    exit /b 1
)
echo ✓ Development deployment completed
echo.

echo 🎉 Development environment ready!
echo.
echo Service URL: https://paynplay-dev.up.railway.app
echo.
echo Next steps:
echo 1. Replace dummy values with real ones in Railway dashboard
echo 2. Test the bot functionality
echo 3. When ready for real clients, use onboard-client.bat
echo.
echo Development environment is ready for testing! 🧪
