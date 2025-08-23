#!/bin/bash

# ========================================
# PAYNPLAY BOT - MULTI-CLUB DEPLOYMENT SCRIPT
# ========================================
# Usage: ./deploy-club.sh [club_name]
# Example: ./deploy-club.sh poker_club
# ========================================

set -e

# Check if club name is provided
if [ -z "$1" ]; then
    echo "❌ Error: Club name is required"
    echo "Usage: ./deploy-club.sh [club_name]"
    echo "Example: ./deploy-club.sh poker_club"
    exit 1
fi

CLUB_NAME=$1
ENV_FILE=".env.${CLUB_NAME}"

echo "🚀 Deploying PaynPlay Bot for club: $CLUB_NAME"

# Check if club configuration exists
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: Club configuration file '$ENV_FILE' not found"
    echo "Available club configurations:"
    ls -la .env.* 2>/dev/null | grep -v ".env$" || echo "No club configurations found"
    echo ""
    echo "To create a new club configuration:"
    echo "1. Copy .env.template to $ENV_FILE"
    echo "2. Edit $ENV_FILE with club-specific values"
    echo "3. Run this script again"
    exit 1
fi

echo "✅ Found club configuration: $ENV_FILE"

# Backup current .env if it exists
if [ -f ".env" ]; then
    echo "📦 Backing up current .env to .env.backup"
    cp .env .env.backup
fi

# Copy club configuration to .env
echo "📋 Loading club configuration..."
cp "$ENV_FILE" .env

# Validate required environment variables
echo "🔍 Validating configuration..."

# Check for required variables
REQUIRED_VARS=("BOT_TOKEN" "CLIENT_NAME" "SHEET_ID")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if ! grep -q "^${var}=" .env; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo "❌ Error: Missing required environment variables:"
    printf '  - %s\n' "${MISSING_VARS[@]}"
    echo ""
    echo "Please update $ENV_FILE with the missing values"
    exit 1
fi

echo "✅ Configuration validation passed"

# Build the project
echo "🔨 Building project..."
npm run build

# Check if build was successful
if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix the errors and try again."
    exit 1
fi

echo "✅ Build completed successfully"

# Display deployment info
echo ""
echo "🎯 Deployment Summary:"
echo "  Club Name: $CLUB_NAME"
echo "  Config File: $ENV_FILE"
echo "  Build Status: ✅ Success"
echo ""
echo "🚀 Ready to deploy!"
echo ""
echo "Next steps:"
echo "1. Deploy to your hosting platform (Railway, Heroku, etc.)"
echo "2. Set the environment variables from $ENV_FILE"
echo "3. Start the bot"
echo ""
echo "To run locally: npm start"
echo "To deploy to Railway: railway up"
echo ""

# Optional: Ask if user wants to deploy now
read -p "Do you want to deploy now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Starting deployment..."
    # Add your deployment command here
    # Example: railway up
    echo "Deployment command would run here"
else
    echo "📋 Deployment ready. Run manually when ready."
fi

echo ""
echo "✅ Club '$CLUB_NAME' deployment setup complete!"
