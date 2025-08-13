@echo off
echo Adding missing environment variables to .env file...
echo.

REM Add missing variables to .env file
echo # Owner handles (used if no OwnerAccounts sheet exists) >> .env
echo ZELLE_HANDLE=your@email.com >> .env
echo VENMO_HANDLE=@your_venmo_handle >> .env
echo CASHAPP_HANDLE=$your_cashapp_handle >> .env
echo PAYPAL_HANDLE=your@paypal_email.com >> .env
echo. >> .env
echo # Group workflow settings >> .env
echo LOADER_GROUP_ID=-1001234567890 >> .env
echo ALLOWED_USER_IDS=123456789,987654321,111222333 >> .env
echo BOT_USERNAME=your_bot_username >> .env
echo PRIVACY_HINTS_ENABLED=true >> .env
echo. >> .env
echo # Security and amount limits >> .env
echo MAX_BUYIN_AMOUNT=10000 >> .env
echo MIN_BUYIN_AMOUNT=20 >> .env
echo. >> .env
echo # Performance and rate limiting >> .env
echo SHEETS_RATE_LIMIT_MS=1000 >> .env
echo SESSION_TIMEOUT_MS=300000 >> .env
echo MAX_MESSAGE_LENGTH=4096 >> .env
echo. >> .env
echo # Client identification (for multi-tenant deployments) >> .env
echo CLIENT_NAME=your_club_name >> .env
echo CLIENT_ID=your_club_id >> .env

echo.
echo Missing variables added to .env file!
echo Please edit the .env file and replace the placeholder values with your actual values.
echo.
pause
