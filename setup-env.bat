@echo off
echo ========================================
echo    Pay-n-Play Bot Environment Setup
echo ========================================
echo.

echo This script will help you set up your environment variables.
echo.

REM Check if .env file exists
if exist .env (
    echo Found existing .env file
    echo Do you want to overwrite it? (y/n)
    set /p overwrite=
    if /i "%overwrite%"=="y" (
        echo Overwriting .env file...
    ) else (
        echo Setup cancelled.
        pause
        exit /b
    )
)

echo.
echo ========================================
echo    Required Variables
echo ========================================
echo.

echo 1. BOT_TOKEN (Required)
echo    Get this from @BotFather on Telegram
echo    Format: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
set /p BOT_TOKEN="Enter your BOT_TOKEN: "

echo.
echo 2. Payment Handles (Required for withdrawals)
echo    These are CRITICAL - without them, withdrawals won't work!
echo.

set /p ZELLE_HANDLE="Enter your Zelle email (or press Enter to skip): "
set /p VENMO_HANDLE="Enter your Venmo handle (or press Enter to skip): "
set /p CASHAPP_HANDLE="Enter your Cash App handle (or press Enter to skip): "
set /p PAYPAL_HANDLE="Enter your PayPal email (or press Enter to skip): "

echo.
echo ========================================
echo    Optional Variables
echo ========================================
echo.

set /p CLIENT_NAME="Enter your club name (or press Enter for default): "
if "%CLIENT_NAME%"=="" set CLIENT_NAME=Pay-n-Play Club

set /p CLIENT_ID="Enter your club ID (or press Enter for default): "
if "%CLIENT_ID%"=="" set CLIENT_ID=default

set /p BOT_USERNAME="Enter your bot username without @ (or press Enter to skip): "

echo.
echo ========================================
echo    Creating .env file...
echo ========================================
echo.

REM Create .env file
(
echo # Pay-n-Play Bot Environment Variables
echo # Generated on %date% %time%
echo.
echo # Required
echo BOT_TOKEN=%BOT_TOKEN%
echo.
echo # Payment Handles ^(Required for withdrawals^)
if not "%ZELLE_HANDLE%"=="" echo ZELLE_HANDLE=%ZELLE_HANDLE%
if not "%VENMO_HANDLE%"=="" echo VENMO_HANDLE=%VENMO_HANDLE%
if not "%CASHAPP_HANDLE%"=="" echo CASHAPP_HANDLE=%CASHAPP_HANDLE%
if not "%PAYPAL_HANDLE%"=="" echo PAYPAL_HANDLE=%PAYPAL_HANDLE%
echo.
echo # Club Configuration
echo CLIENT_NAME=%CLIENT_NAME%
echo CLIENT_ID=%CLIENT_ID%
if not "%BOT_USERNAME%"=="" echo BOT_USERNAME=%BOT_USERNAME%
echo.
echo # Optional ^(set these later if needed^)
echo # LOADER_GROUP_ID=-1001234567890
echo # ALLOWED_USER_IDS=123456789,987654321
echo # SHEET_ID=your_google_sheet_id
echo # GOOGLE_CLIENT_EMAIL=your_service_account@project.iam.gserviceaccount.com
echo # GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour key here\n-----END PRIVATE KEY-----\n"
) > .env

echo ✅ .env file created successfully!
echo.
echo ========================================
echo    Next Steps
echo ========================================
echo.
echo 1. Test your setup: node debug-env.js
echo 2. Start the bot: npm start
echo 3. Test buy-ins and withdrawals
echo 4. Deploy to production when ready
echo.
echo ========================================
echo    Important Notes
echo ========================================
echo.
if "%ZELLE_HANDLE%"=="" if "%VENMO_HANDLE%"=="" if "%CASHAPP_HANDLE%"=="" if "%PAYPAL_HANDLE%"=="" (
    echo ⚠️  WARNING: No payment handles configured!
    echo    Withdrawals will not work until you add them.
    echo    Edit .env file and add your payment handles.
) else (
    echo ✅ Payment handles configured - withdrawals should work!
)
echo.
echo For production deployment, you'll also need:
echo - LOADER_GROUP_ID (for group workflow)
echo - ALLOWED_USER_IDS (for payment confirmation)
echo - Google Sheets integration (optional)
echo.
pause
