#!/bin/bash

# Update Environment Variables for Pay-n-Play Bot Services
# Usage: ./update-env-vars.sh <service-name>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check arguments
if [ $# -lt 1 ]; then
    echo -e "${RED}Error: Missing service name${NC}"
    echo "Usage: $0 <service-name>"
    echo ""
    echo "Example: $0 pokerclub"
    exit 1
fi

SERVICE_NAME=$1

echo -e "${BLUE}🔧 Updating environment variables for service: ${SERVICE_NAME}${NC}"
echo ""

# Switch to the service
echo -e "${YELLOW}Connecting to service...${NC}"
railway service connect $SERVICE_NAME
if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Could not connect to service ${SERVICE_NAME}${NC}"
    echo "Make sure the service exists and you have access to it."
    exit 1
fi

echo -e "${GREEN}✓ Connected to service${NC}"
echo ""

echo -e "${YELLOW}Adding new security and performance variables...${NC}"

# Security and amount limits
railway variables set MAX_BUYIN_AMOUNT="10000"
railway variables set MIN_BUYIN_AMOUNT="20"

# Performance and rate limiting
railway variables set SHEETS_RATE_LIMIT_MS="1000"
railway variables set SESSION_TIMEOUT_MS="300000"
railway variables set MAX_MESSAGE_LENGTH="4096"

# Client identification
railway variables set CLIENT_NAME="$SERVICE_NAME"
railway variables set CLIENT_ID="$SERVICE_NAME"

echo -e "${GREEN}✓ Environment variables updated${NC}"
echo ""

echo -e "${YELLOW}🚀 Redeploying service to apply changes...${NC}"
railway up
if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Deployment failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Service redeployed successfully${NC}"
echo ""

echo -e "${GREEN}🎉 Environment variables updated for ${SERVICE_NAME}!${NC}"
echo ""
echo "New variables added:"
echo "- MAX_BUYIN_AMOUNT=10000"
echo "- MIN_BUYIN_AMOUNT=20"
echo "- SHEETS_RATE_LIMIT_MS=1000"
echo "- SESSION_TIMEOUT_MS=300000"
echo "- MAX_MESSAGE_LENGTH=4096"
echo "- CLIENT_NAME=$SERVICE_NAME"
echo "- CLIENT_ID=$SERVICE_NAME"
echo ""
echo "Service URL: https://$SERVICE_NAME.up.railway.app"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Test the bot: /ping"
echo "2. Verify payment matching works"
echo "3. Check logs for any issues"
echo "4. Monitor performance metrics"
