@echo off
REM ========================================
REM PAYNPLAY BOT - MULTI-CLUB DEPLOYMENT SCRIPT (Windows)
REM ========================================
REM Usage: deploy-club.bat [club_name]
REM Example: deploy-club.bat poker_club
REM ========================================

setlocal enabledelayedexpansion

REM Check if club name is provided
if "%~1"=="" (
    echo ❌ Error: Club name is required
    echo Usage: deploy-club.bat [club_name]
    echo Example: deploy-club.bat poker_club
    exit /b 1
)

set CLUB_NAME=%~1
set ENV_FILE=.env.%CLUB_NAME%

echo 🚀 Deploying PaynPlay Bot for club: %CLUB_NAME%

REM Check if club configuration exists
if not exist "%ENV_FILE%" (
    echo ❌ Error: Club configuration file '%ENV_FILE%' not found
    echo Available club configurations:
    dir .env.* 2>nul | findstr /v ".env$" || echo No club configurations found
    echo.
    echo To create a new club configuration:
    echo 1. Copy .env.template to %ENV_FILE%
    echo 2. Edit %ENV_FILE% with club-specific values
    echo 3. Run this script again
    exit /b 1
)

echo ✅ Found club configuration: %ENV_FILE%

REM Backup current .env if it exists
if exist ".env" (
    echo 📦 Backing up current .env to .env.backup
    copy .env .env.backup >nul
)

REM Copy club configuration to .env
echo 📋 Loading club configuration...
copy "%ENV_FILE%" .env >nul

REM Validate required environment variables
echo 🔍 Validating configuration...

REM Check for required variables
set REQUIRED_VARS=BOT_TOKEN CLIENT_NAME SHEET_ID
set MISSING_VARS=

for %%v in (%REQUIRED_VARS%) do (
    findstr /c:"%%v=" .env >nul 2>&1
    if errorlevel 1 (
        if defined MISSING_VARS (
            set MISSING_VARS=!MISSING_VARS!, %%v
        ) else (
            set MISSING_VARS=%%v
        )
    )
)

if defined MISSING_VARS (
    echo ❌ Error: Missing required environment variables:
    echo   %MISSING_VARS%
    echo.
    echo Please update %ENV_FILE% with the missing values
    exit /b 1
)

echo ✅ Configuration validation passed

REM Build the project
echo 🔨 Building project...
call npm run build

REM Check if build was successful
if errorlevel 1 (
    echo ❌ Build failed. Please fix the errors and try again.
    exit /b 1
)

echo ✅ Build completed successfully

REM Display deployment info
echo.
echo 🎯 Deployment Summary:
echo   Club Name: %CLUB_NAME%
echo   Config File: %ENV_FILE%
echo   Build Status: ✅ Success
echo.
echo 🚀 Ready to deploy!
echo.
echo Next steps:
echo 1. Deploy to your hosting platform (Railway, Heroku, etc.)
echo 2. Set the environment variables from %ENV_FILE%
echo 3. Start the bot
echo.
echo To run locally: npm start
echo To deploy to Railway: railway up
echo.

REM Optional: Ask if user wants to deploy now
set /p DEPLOY_NOW="Do you want to deploy now? (y/N): "
if /i "%DEPLOY_NOW%"=="y" (
    echo 🚀 Starting deployment...
    REM Add your deployment command here
    REM Example: railway up
    echo Deployment command would run here
) else (
    echo 📋 Deployment ready. Run manually when ready.
)

echo.
echo ✅ Club '%CLUB_NAME%' deployment setup complete!
