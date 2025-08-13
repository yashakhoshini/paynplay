@echo off
setlocal enabledelayedexpansion

REM Update Environment Variables for Pay-n-Play Bot Services
REM Usage: update-env-vars.bat <service-name>

if "%~1"=="" (
    echo Error: Missing service name
    echo Usage: %0 ^<service-name^>
    echo.
    echo Example: %0 pokerclub
    exit /b 1
)

set SERVICE_NAME=%~1

echo 🔧 Updating environment variables for service: %SERVICE_NAME%
echo.

REM Switch to the service
railway service connect %SERVICE_NAME%
if errorlevel 1 (
    echo Error: Could not connect to service %SERVICE_NAME%
    echo Make sure the service exists and you have access to it.
    exit /b 1
)

echo ✓ Connected to service
echo.

echo Adding new security and performance variables...

REM Security and amount limits
railway variables set MAX_BUYIN_AMOUNT="10000"
railway variables set MIN_BUYIN_AMOUNT="20"

REM Performance and rate limiting
railway variables set SHEETS_RATE_LIMIT_MS="1000"
railway variables set SESSION_TIMEOUT_MS="300000"
railway variables set MAX_MESSAGE_LENGTH="4096"

REM Client identification
railway variables set CLIENT_NAME="%SERVICE_NAME%"
railway variables set CLIENT_ID="%SERVICE_NAME%"

echo ✓ Environment variables updated
echo.

echo 🚀 Redeploying service to apply changes...
railway up
if errorlevel 1 (
    echo Error: Deployment failed
    exit /b 1
)

echo ✓ Service redeployed successfully
echo.

echo 🎉 Environment variables updated for %SERVICE_NAME%!
echo.
echo New variables added:
echo - MAX_BUYIN_AMOUNT=10000
echo - MIN_BUYIN_AMOUNT=20  
echo - SHEETS_RATE_LIMIT_MS=1000
echo - SESSION_TIMEOUT_MS=300000
echo - MAX_MESSAGE_LENGTH=4096
echo - CLIENT_NAME=%SERVICE_NAME%
echo - CLIENT_ID=%SERVICE_NAME%
echo.
echo Service URL: https://%SERVICE_NAME%.up.railway.app
echo.
echo Next steps:
echo 1. Test the bot: /ping
echo 2. Verify payment matching works
echo 3. Check logs for any issues
echo 4. Monitor performance metrics
