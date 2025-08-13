#!/bin/bash

# Multi-Tenant Bot Deployment Script
# Usage: ./deploy-club.sh <club-name> <bot-token> <sheet-id> <group-id> <allowed-ids>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}Error: Railway CLI is not installed. Please install it first:${NC}"
    echo "npm install -g @railway/cli"
    echo "railway login"
    exit 1
fi

# Check arguments
if [ $# -lt 5 ]; then
    echo -e "${RED}Usage: $0 <club-name> <bot-token> <sheet-id> <group-id> <allowed-ids>${NC}"
    echo ""
    echo "Arguments:"
    echo "  club-name    - Name for the club (e.g., pokerclub)"
    echo "  bot-token    - Telegram bot token from @BotFather"
    echo "  sheet-id     - Google Sheet ID"
    echo "  group-id     - Telegram group chat ID"
    echo "  allowed-ids  - Comma-separated list of loader user IDs"
    echo ""
    echo "Example:"
    echo "  $0 pokerclub 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms -1001234567890 123456789,987654321"
    exit 1
fi

CLUB_NAME=$1
BOT_TOKEN=$2
SHEET_ID=$3
GROUP_ID=$4
ALLOWED_IDS=$5

echo -e "${BLUE}🚀 Deploying bot for club: ${CLUB_NAME}${NC}"
echo ""

# Validate inputs
echo -e "${YELLOW}Validating inputs...${NC}"

if [[ ! $BOT_TOKEN =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]; then
    echo -e "${RED}Error: Invalid bot token format${NC}"
    exit 1
fi

if [[ ! $SHEET_ID =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo -e "${RED}Error: Invalid sheet ID format${NC}"
    exit 1
fi

if [[ ! $GROUP_ID =~ ^-?[0-9]+$ ]]; then
    echo -e "${RED}Error: Invalid group ID format${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Input validation passed${NC}"
echo ""

# Create Railway service
echo -e "${YELLOW}Creating Railway service...${NC}"
railway service create $CLUB_NAME
echo -e "${GREEN}✓ Service created${NC}"
echo ""

# Set environment variables
echo -e "${YELLOW}Setting environment variables...${NC}"

# Required variables
railway variables set BOT_TOKEN="$BOT_TOKEN"
railway variables set SHEET_ID="$SHEET_ID"
railway variables set LOADER_GROUP_ID="$GROUP_ID"
railway variables set ALLOWED_USER_IDS="$ALLOWED_IDS"

# Google service account (you'll need to set these manually)
echo -e "${YELLOW}⚠️  You need to manually set these variables in Railway dashboard:${NC}"
echo "  GOOGLE_CLIENT_EMAIL"
echo "  GOOGLE_PRIVATE_KEY"
echo ""

# Optional variables with defaults
railway variables set BASE_URL="https://$CLUB_NAME.up.railway.app"
railway variables set PORT="8080"
railway variables set METHODS_ENABLED_DEFAULT="ZELLE,VENMO,CASHAPP,PAYPAL"
railway variables set CURRENCY_DEFAULT="USD"
railway variables set FAST_FEE_PCT_DEFAULT="0.02"
railway variables set OWNER_FALLBACK_THRESHOLD="100"
railway variables set PRIVACY_HINTS_ENABLED="true"

echo -e "${GREEN}✓ Environment variables set${NC}"
echo ""

# Deploy
echo -e "${YELLOW}Deploying service...${NC}"
railway up
echo -e "${GREEN}✓ Deployment completed${NC}"
echo ""

# Get service URL
SERVICE_URL=$(railway status --json | jq -r '.url // empty')
if [ -n "$SERVICE_URL" ]; then
    echo -e "${GREEN}🎉 Bot deployed successfully!${NC}"
    echo ""
    echo -e "${BLUE}Service URL:${NC} $SERVICE_URL"
    echo -e "${BLUE}Webhook URL:${NC} $SERVICE_URL/$BOT_TOKEN"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in Railway dashboard"
    echo "2. Test the bot: /ping"
    echo "3. Verify webhook: https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
    echo "4. Test buy-in flow"
    echo ""
    echo -e "${GREEN}Bot is ready for $CLUB_NAME! 🎰${NC}"
else
    echo -e "${RED}Error: Could not get service URL${NC}"
    echo "Check Railway dashboard for the service URL"
fi
