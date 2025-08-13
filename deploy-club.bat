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
    echo   group-id     - Telegram group chat ID (must be negative)
    echo   allowed-ids  - Comma-separated list of loader user IDs
    echo.
    echo Example:
    echo   %0 pokerclub 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms -1001234567890 123456789,987654321
    echo.
    echo Security Note: Bot tokens will be stored securely in Railway dashboard.
    echo Do not share or log these credentials.
    exit /b 1
)

set CLUB_NAME=%~1
set BOT_TOKEN=%~2
set SHEET_ID=%~3
set GROUP_ID=%~4
set ALLOWED_IDS=%~5

echo 🚀 Deploying bot for club: %CLUB_NAME%
echo.

REM Validate inputs
echo Validating inputs...

REM Validate bot token format
echo %BOT_TOKEN% | findstr /r "^[0-9][0-9]*:[A-Za-z0-9_-]*$" >nul
if errorlevel 1 (
    echo ❌ Error: Invalid bot token format. Should be number:alphanumeric
    exit /b 1
)

REM Validate sheet ID format
echo %SHEET_ID% | findstr /r "^[A-Za-z0-9_-]*$" >nul
if errorlevel 1 (
    echo ❌ Error: Invalid sheet ID format
    exit /b 1
)

REM Validate group ID (must be negative)
set /a "test_group_id=%GROUP_ID%" >nul 2>&1
if errorlevel 1 (
    echo ❌ Error: Invalid group ID format (must be a number)
    exit /b 1
)
if %test_group_id% geq 0 (
    echo ❌ Error: Group ID must be negative (e.g., -1001234567890)
    exit /b 1
)

REM Validate allowed user IDs
for %%i in (%ALLOWED_IDS:,= %) do (
    set /a "test_user_id=%%i" >nul 2>&1
    if errorlevel 1 (
        echo ❌ Error: Invalid user ID in allowed-ids: %%i
        exit /b 1
    )
    if !test_user_id! leq 0 (
        echo ❌ Error: User ID must be positive: %%i
        exit /b 1
    )
)

echo ✓ Input validation passed
echo.

REM Check if Railway CLI is installed
railway --version >nul 2>&1
if errorlevel 1 (
    echo Error: Railway CLI is not installed. Please install it first:
    echo npm install -g @railway/cli
    echo railway login
    exit /b 1
)

echo Creating Railway service...
railway service create %CLUB_NAME%
if errorlevel 1 (
    echo Error: Failed to create Railway service
    echo This might happen if the service name already exists.
    echo Try a different club name or delete the existing service.
    exit /b 1
)
echo ✓ Service created
echo.

echo Setting environment variables...

REM Required variables (set via Railway CLI - these are logged but Railway handles them securely)
railway variables set BOT_TOKEN="%BOT_TOKEN%"
railway variables set SHEET_ID="%SHEET_ID%"
railway variables set LOADER_GROUP_ID="%GROUP_ID%"
railway variables set ALLOWED_USER_IDS="%ALLOWED_IDS%"

REM Client identification
railway variables set CLIENT_NAME="%CLUB_NAME%"
railway variables set CLIENT_ID="%CLUB_NAME%"

REM Optional variables with secure defaults
railway variables set BASE_URL="https://%CLUB_NAME%.up.railway.app"
railway variables set PORT="8080"
railway variables set METHODS_ENABLED_DEFAULT="ZELLE,VENMO,CASHAPP,PAYPAL"
railway variables set CURRENCY_DEFAULT="USD"
railway variables set FAST_FEE_PCT_DEFAULT="0.02"
railway variables set OWNER_FALLBACK_THRESHOLD="100"
railway variables set PRIVACY_HINTS_ENABLED="true"

REM Security and performance settings
railway variables set MAX_BUYIN_AMOUNT="10000"
railway variables set MIN_BUYIN_AMOUNT="20"
railway variables set SHEETS_RATE_LIMIT_MS="1000"
railway variables set SESSION_TIMEOUT_MS="300000"
railway variables set MAX_MESSAGE_LENGTH="4096"

echo ✓ Environment variables set
echo.

echo ⚠️  CRITICAL: You need to manually set these variables in Railway dashboard:
echo   GOOGLE_CLIENT_EMAIL
echo   GOOGLE_PRIVATE_KEY
echo.
echo Instructions:
echo 1. Go to Railway dashboard: https://railway.app/dashboard
echo 2. Find the "%CLUB_NAME%" service
echo 3. Go to Variables tab
echo 4. Add these variables:
echo    - GOOGLE_CLIENT_EMAIL = your service account email
echo    - GOOGLE_PRIVATE_KEY = your service account private key (with \n escapes)
echo.
echo Security Note: Never commit these credentials to version control!
echo.

echo Deploying service...
railway up
if errorlevel 1 (
    echo Error: Deployment failed
    echo Check Railway logs for details
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
echo 5. Add bot to your Telegram group
echo.
echo Bot is ready for %CLUB_NAME%! 🎰
echo.
echo Service URL: https://%CLUB_NAME%.up.railway.app
echo Webhook URL: https://%CLUB_NAME%.up.railway.app/%BOT_TOKEN%
echo.
echo Remember to:
echo - Share your Google Sheet with the service account email
echo - Add the bot to your Telegram group
echo - Test all payment methods
echo - Monitor logs for any issues
