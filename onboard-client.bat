@echo off
setlocal enabledelayedexpansion

REM Multi-Tenant Client Onboarding Script
REM Usage: onboard-client.bat <club-name> <bot-token> <sheet-id> <group-id> <owner-ids> <loader-ids>

REM Check arguments
if "%~6"=="" (
    echo Error: Missing arguments
    echo Usage: %0 ^<club-name^> ^<bot-token^> ^<sheet-id^> ^<group-id^> ^<owner-ids^> ^<loader-ids^>
    echo.
    echo Arguments:
    echo   club-name    - Name for the club (e.g., pokerclub)
    echo   bot-token    - Telegram bot token from @BotFather
    echo   sheet-id     - Google Sheet ID
    echo   group-id     - Telegram group chat ID (must be negative)
    echo   owner-ids    - Comma-separated list of owner user IDs
    echo   loader-ids   - Comma-separated list of loader user IDs
    echo.
    echo Example:
    echo   %0 pokerclub 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms -1001234567890 123456789,987654321 111222333,444555666
    echo.
    echo Security Note: Bot tokens will be stored securely in Railway dashboard.
    echo Do not share or log these credentials.
    exit /b 1
)

set CLUB_NAME=%~1
set BOT_TOKEN=%~2
set SHEET_ID=%~3
set GROUP_ID=%~4
set OWNER_IDS=%~5
set LOADER_IDS=%~6

echo 🚀 Onboarding new client: %CLUB_NAME%
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

REM Validate owner user IDs
for %%i in (%OWNER_IDS:,= %) do (
    set /a "test_user_id=%%i" >nul 2>&1
    if errorlevel 1 (
        echo ❌ Error: Invalid owner ID: %%i
        exit /b 1
    )
    if !test_user_id! leq 0 (
        echo ❌ Error: Owner ID must be positive: %%i
        exit /b 1
    )
)

REM Validate loader user IDs
for %%i in (%LOADER_IDS:,= %) do (
    set /a "test_user_id=%%i" >nul 2>&1
    if errorlevel 1 (
        echo ❌ Error: Invalid loader ID: %%i
        exit /b 1
    )
    if !test_user_id! leq 0 (
        echo ❌ Error: Loader ID must be positive: %%i
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

echo Creating Railway service for %CLUB_NAME%...
railway service create %CLUB_NAME%
if errorlevel 1 (
    echo Error: Failed to create Railway service
    echo This might happen if the service name already exists.
    echo Try a different club name or delete the existing service.
    exit /b 1
)
echo ✓ Service created
echo.

echo Setting environment variables for %CLUB_NAME%...

REM Required variables for this client
railway variables set BOT_TOKEN="%BOT_TOKEN%"
railway variables set SHEET_ID="%SHEET_ID%"
railway variables set LOADER_GROUP_ID="%GROUP_ID%"
railway variables set OWNER_IDS="%OWNER_IDS%"
railway variables set LOADER_IDS="%LOADER_IDS%"

REM Combine owner and loader IDs for ALLOWED_USER_IDS
set ALLOWED_USER_IDS=%OWNER_IDS%,%LOADER_IDS%
railway variables set ALLOWED_USER_IDS="%ALLOWED_USER_IDS%"

REM Client identification
railway variables set CLIENT_NAME="%CLUB_NAME%"
railway variables set CLIENT_ID="%CLUB_NAME%"

REM Service URL and webhook
railway variables set BASE_URL="https://%CLUB_NAME%.up.railway.app"
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

echo Deploying %CLUB_NAME% service...
railway up
if errorlevel 1 (
    echo Error: Deployment failed
    echo Check Railway logs for details
    exit /b 1
)
echo ✓ Deployment completed
echo.

echo 🎉 Client %CLUB_NAME% onboarded successfully!
echo.
echo Next steps:
echo 1. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in Railway dashboard
echo 2. Share your Google Sheet with the service account email
echo 3. Add the bot to your Telegram group
echo 4. Test the bot: /ping
echo 5. Verify webhook: https://api.telegram.org/bot%BOT_TOKEN%/getWebhookInfo
echo 6. Test buy-in flow with owners/loaders
echo.
echo Service URL: https://%CLUB_NAME%.up.railway.app
echo Webhook URL: https://%CLUB_NAME%.up.railway.app/%BOT_TOKEN%
echo.
echo Client %CLUB_NAME% is ready! 🎰
