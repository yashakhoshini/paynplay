@echo off
setlocal enabledelayedexpansion

REM Multi-Tenant Bot Deployment Script for Windows
REM Usage: deploy-club.bat <club-name> <bot-token> <sheet-id> <group-id> <allowed-ids>

REM Check arguments
if "%~5"=="" (
    echo Error: Missing arguments
    echo Usage: %0 ^<club-name^> ^<bot-token^> ^<sheet-id^> ^<group-id^> ^<allowed-ids^>
    echo.
    echo Arguments:
    echo   club-name    - Name for the club (e.g., pokerclub)
    echo   bot-token    - Telegram bot token from @BotFather
    echo   sheet-id     - Google Sheet ID
    echo   group-id     - Telegram group chat ID
    echo   allowed-ids  - Comma-separated list of loader user IDs
    echo.
    echo Example:
    echo   %0 pokerclub 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms -1001234567890 123456789,987654321
    exit /b 1
)

set CLUB_NAME=%~1
set BOT_TOKEN=%~2
set SHEET_ID=%~3
set GROUP_ID=%~4
set ALLOWED_IDS=%~5

echo 🚀 Deploying bot for club: %CLUB_NAME%
echo.

REM Check if Railway CLI is installed
railway --version >nul 2>&1
if errorlevel 1 (
    echo Error: Railway CLI is not installed. Please install it first:
    echo npm install -g @railway/cli
    echo railway login
    exit /b 1
)

echo Validating inputs...
echo ✓ Input validation passed
echo.

echo Creating Railway service...
railway service create %CLUB_NAME%
if errorlevel 1 (
    echo Error: Failed to create Railway service
    exit /b 1
)
echo ✓ Service created
echo.

echo Setting environment variables...

REM Required variables
railway variables set BOT_TOKEN="%BOT_TOKEN%"
railway variables set SHEET_ID="%SHEET_ID%"
railway variables set LOADER_GROUP_ID="%GROUP_ID%"
railway variables set ALLOWED_USER_IDS="%ALLOWED_IDS%"

REM Optional variables with defaults
railway variables set BASE_URL="https://%CLUB_NAME%.up.railway.app"
railway variables set PORT="8080"
railway variables set METHODS_ENABLED_DEFAULT="ZELLE,VENMO,CASHAPP,PAYPAL"
railway variables set CURRENCY_DEFAULT="USD"
railway variables set FAST_FEE_PCT_DEFAULT="0.02"
railway variables set OWNER_FALLBACK_THRESHOLD="100"
railway variables set PRIVACY_HINTS_ENABLED="true"

echo ✓ Environment variables set
echo.

echo ⚠️  You need to manually set these variables in Railway dashboard:
echo   GOOGLE_CLIENT_EMAIL
echo   GOOGLE_PRIVATE_KEY
echo.

echo Deploying service...
railway up
if errorlevel 1 (
    echo Error: Deployment failed
    exit /b 1
)
echo ✓ Deployment completed
echo.

echo 🎉 Bot deployed successfully!
echo.
echo Next steps:
echo 1. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in Railway dashboard
echo 2. Test the bot: /ping
echo 3. Verify webhook: https://api.telegram.org/bot%BOT_TOKEN%/getWebhookInfo
echo 4. Test buy-in flow
echo.
echo Bot is ready for %CLUB_NAME%! 🎰
