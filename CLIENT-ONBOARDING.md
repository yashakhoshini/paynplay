# Client Onboarding Checklist

## Pre-Onboarding Information Collection

### Client Details
- [ ] Club name: ________________
- [ ] Contact person: ________________
- [ ] Email: ________________
- [ ] Phone: ________________
- [ ] Preferred bot username: ________________

### Technical Requirements
- [ ] Google Sheet URL: ________________
- [ ] Loader group name: ________________
- [ ] List of loader user IDs: ________________
- [ ] Preferred payment methods: ________________
- [ ] Club currency: ________________
- [ ] Fast fee percentage: ________________

## Step-by-Step Onboarding Process

### Phase 1: Client Preparation (Client does this)

#### 1. Create Telegram Bot
- [ ] Message @BotFather on Telegram
- [ ] Send `/newbot`
- [ ] Choose bot name (e.g., "Poker Club Bot")
- [ ] Choose username (e.g., "@pokerclub_bot")
- [ ] **Save the bot token** and send to you

#### 2. Prepare Google Sheet
- [ ] Create new sheet or provide existing one
- [ ] Share sheet with service account email (you'll provide this)
- [ ] **Send the sheet URL** to you

#### 3. Create Loader Group
- [ ] Create Telegram group for loaders/owners
- [ ] Add your bot to the group
- [ ] Add @RawDataBot to get group chat ID
- [ ] **Send the group chat ID** to you
- [ ] **Send list of loader user IDs** to you

### Phase 2: Deployment (You do this)

#### 1. Deploy Bot
- [ ] Run deployment script: `./deploy-club.sh <club-name> <bot-token> <sheet-id> <group-id> <allowed-ids>`
- [ ] Set Google service account credentials in Railway dashboard
- [ ] Verify deployment success

#### 2. Configure Webhook
- [ ] Check webhook is set: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
- [ ] Verify webhook URL is correct

#### 3. Test Bot
- [ ] Send `/ping` to bot - should respond "pong ✅"
- [ ] Send `/start` to bot - should show welcome message
- [ ] Test buy-in flow with small amount
- [ ] Verify transaction card appears in loader group
- [ ] Test "Mark Paid" functionality

### Phase 3: Client Training (Client does this)

#### 1. Basic Operations
- [ ] How to start a buy-in (`/start`)
- [ ] How to select payment method
- [ ] How to enter amount
- [ ] How to send payment proof

#### 2. Loader Operations
- [ ] How to mark payments as paid
- [ ] How to verify payment screenshots
- [ ] How to handle disputes

#### 3. Admin Operations
- [ ] How to update Google Sheet settings
- [ ] How to add/remove loaders
- [ ] How to change payment methods

## Post-Onboarding

### Documentation
- [ ] Send client the user manual
- [ ] Provide contact information for support
- [ ] Set up monitoring alerts

### Follow-up
- [ ] Check in after 1 week
- [ ] Address any issues
- [ ] Collect feedback
- [ ] Schedule training session if needed

## Troubleshooting Common Issues

### Bot Not Responding
- [ ] Check if bot is running in Railway
- [ ] Verify webhook is set correctly
- [ ] Check bot token is correct

### Sheet Access Issues
- [ ] Verify service account has Editor access
- [ ] Check sheet ID is correct
- [ ] Ensure sheet is not in restricted mode

### Group Messages Not Working
- [ ] Check group chat ID format
- [ ] Verify bot is added to group
- [ ] Ensure bot has permission to send messages

### Payment Method Issues
- [ ] Check payment method is enabled in settings
- [ ] Verify owner handles are set correctly
- [ ] Test with different payment method

## Client Success Metrics

Track these metrics to ensure successful onboarding:
- [ ] Bot responds to commands within 5 seconds
- [ ] Buy-in flow completes successfully
- [ ] Transaction cards appear in loader group
- [ ] "Mark Paid" functionality works
- [ ] Google Sheet updates correctly
- [ ] Client reports satisfaction with setup

## Support Resources

### For You (Deployer)
- Railway dashboard: https://railway.app
- Google Cloud Console: https://console.cloud.google.com
- BotFather: @BotFather on Telegram

### For Client
- Bot username: @[BOT_USERNAME]
- Support contact: [YOUR_CONTACT_INFO]
- User manual: [LINK_TO_MANUAL]
- FAQ: [LINK_TO_FAQ]
