@echo off
REM ========================================
REM PAYNPLAY BOT - CREATE CLUB CONFIGURATION
REM ========================================
REM Usage: create-club-config.bat [club_name]
REM Example: create-club-config.bat poker_club
REM ========================================

setlocal enabledelayedexpansion

REM Check if club name is provided
if "%~1"=="" (
    echo ❌ Error: Club name is required
    echo Usage: create-club-config.bat [club_name]
    echo Example: create-club-config.bat poker_club
    exit /b 1
)

set CLUB_NAME=%~1
set TEMPLATE_FILE=.env test
set NEW_FILE=.env.%CLUB_NAME%

echo 🚀 Creating configuration for club: %CLUB_NAME%

REM Check if template exists
if not exist "%TEMPLATE_FILE%" (
    echo ❌ Error: Template file '%TEMPLATE_FILE%' not found
    exit /b 1
)

REM Check if club config already exists
if exist "%NEW_FILE%" (
    echo ⚠️  Warning: Club configuration '%NEW_FILE%' already exists
    set /p OVERWRITE="Do you want to overwrite it? (y/N): "
    if /i not "!OVERWRITE!"=="y" (
        echo ❌ Operation cancelled
        exit /b 1
    )
)

REM Copy template to new club configuration
copy "%TEMPLATE_FILE%" "%NEW_FILE%" >nul

if %ERRORLEVEL% EQU 0 (
    echo ✅ Club configuration created: %NEW_FILE%
    echo.
    echo 📝 Next steps:
    echo 1. Edit %NEW_FILE% with club-specific values
    echo 2. Update BOT_TOKEN, SHEET_ID, and payment handles
    echo 3. Run: deploy-club.bat %CLUB_NAME%
    echo.
    echo 🔧 You can now edit the file with your preferred editor
    echo    Example: notepad %NEW_FILE%
) else (
    echo ❌ Error: Failed to create club configuration
    exit /b 1
)

