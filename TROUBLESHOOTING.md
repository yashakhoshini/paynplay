# Pay-n-Play Bot Troubleshooting Guide

## 🚨 Critical Issues Fixed

### 1. **Deposit/Withdrawal Flow Issues**

#### **Problem**: Race Conditions in Cashout Matching
- **Issue**: Multiple concurrent requests could match the same cashout
- **Fix**: Added atomic update with status check and retry logic
- **Location**: `src/matcher.ts` - Lines 67-85

#### **Problem**: Missing Error Handling in Matcher
- **Issue**: If `getOpenCashouts()` fails, entire matching system breaks
- **Fix**: Added try-catch with fallback to owner routing
- **Location**: `src/matcher.ts` - Lines 45-55

#### **Problem**: Invalid Amount Validation
- **Issue**: No maximum amount limit, could allow excessive amounts
- **Fix**: Added reasonable upper bounds and validation
- **Location**: `src/config.ts` - Lines 40-45, `src/matcher.ts` - Lines 25-35

### 2. **Client-Specific Deployment Issues**

#### **Problem**: Missing Environment Validation
- **Issue**: Bot crashes on startup if any required env var is missing
- **Fix**: Added graceful degradation and better error messages
- **Location**: `src/config.ts` - Lines 8-65

#### **Problem**: Deployment Script Security
- **Issue**: Bot tokens are logged in Railway CLI history
- **Fix**: Added security warnings and validation
- **Location**: `deploy-club.bat` - Lines 15-20, 25-50

#### **Problem**: Missing Client Isolation
- **Issue**: Current setup doesn't properly isolate different client instances
- **Fix**: Added client-specific configuration validation
- **Location**: `src/config.ts` - Lines 70-75

### 3. **Google Sheets Integration Issues**

#### **Problem**: Schema Mapping Failures
- **Issue**: Low confidence mappings could cause data corruption
- **Fix**: Added minimum confidence thresholds and fallback strategies
- **Location**: `src/sheets.ts` - Lines 280-285

#### **Problem**: Sheet Permission Issues
- **Issue**: No validation that service account has proper permissions
- **Fix**: Add permission validation on startup
- **Location**: `src/sheets.ts` - Lines 75-95

#### **Problem**: Rate Limiting
- **Issue**: No rate limiting for Google Sheets API calls
- **Fix**: Implement request throttling and retry logic
- **Location**: `src/sheets.ts` - Lines 15-35, 40-60

### 4. **Telegram Bot Issues**

#### **Problem**: Session Management Problems
- **Issue**: Sessions can become stale and cause flow issues
- **Fix**: Add session timeout and cleanup
- **Location**: `src/index.ts` - Lines 30-40, 50-60

#### **Problem**: Authorization Bypass
- **Issue**: `ALLOWED_USER_IDS` could be empty array, allowing unauthorized access
- **Fix**: Add proper validation and default deny
- **Location**: `src/index.ts` - Lines 85-90

#### **Problem**: Message Length Limits
- **Issue**: No validation for message length in group posts
- **Fix**: Add truncation for long messages
- **Location**: `src/index.ts` - Lines 80-85

## 🔧 Common Issues and Solutions

### **Bot Not Responding**

#### **Symptoms**:
- Bot doesn't respond to `/ping`
- No webhook updates received

#### **Solutions**:
1. **Check Webhook Status**:
   ```bash
   curl https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo
   ```

2. **Verify Environment Variables**:
   - `BOT_TOKEN` is valid and not expired
   - `BASE_URL` is correct and accessible
   - All required variables are set

3. **Check Railway Logs**:
   ```bash
   railway logs
   ```

4. **Restart the Service**:
   ```bash
   railway up
   ```

### **Google Sheets Access Issues**

#### **Symptoms**:
- "Unable to access payment data" errors
- Sheet permission denied errors

#### **Solutions**:
1. **Verify Service Account Permissions**:
   - Share sheet with service account email
   - Ensure Editor permissions are granted
   - Check sheet ID is correct

2. **Validate Service Account Credentials**:
   - `GOOGLE_CLIENT_EMAIL` is correct
   - `GOOGLE_PRIVATE_KEY` has proper formatting with `\n` escapes
   - Service account has Google Sheets API enabled

3. **Check Sheet Format**:
   - Ensure sheet has headers in first row
   - Verify required columns exist (Payment Method, Amount, Status)

### **Payment Matching Issues**

#### **Symptoms**:
- No matches found for valid cashouts
- Incorrect payment routing

#### **Solutions**:
1. **Check Cashout Data**:
   - Verify cashouts have correct status (pending/open)
   - Ensure payment methods match exactly (ZELLE, VENMO, etc.)
   - Check amounts are numeric and positive

2. **Review Schema Mapping**:
   - Check console logs for mapping confidence
   - Verify column headers are recognized
   - Consider adding explicit column mapping

3. **Validate Amount Limits**:
   - Check `MAX_BUYIN_AMOUNT` and `MIN_BUYIN_AMOUNT` settings (min $20, max $10,000)
   - Ensure amounts are within configured limits

### **Authorization Issues**

#### **Symptoms**:
- "Not authorized" errors for valid users
- Mark Paid buttons not working

#### **Solutions**:
1. **Verify User IDs**:
   - Check `ALLOWED_USER_IDS` format (comma-separated)
   - Ensure user IDs are positive numbers
   - Verify users are in the loader group

2. **Check Group Settings**:
   - `LOADER_GROUP_ID` must be negative number
   - Bot must be added to the group
   - Users must be members of the group

3. **Validate Permissions**:
   - Users must be in `ALLOWED_USER_IDS` list
   - Bot must have permission to send messages in group

### **Session and Flow Issues**

#### **Symptoms**:
- Bot gets stuck in conversation flow
- Session data becomes corrupted

#### **Solutions**:
1. **Check Session Timeout**:
   - Verify `SESSION_TIMEOUT_MS` setting (default: 5 minutes)
   - Users may need to restart conversation with `/start`

2. **Clear Session Data**:
   - Restart conversation with `/start`
   - Wait for session timeout to expire

3. **Monitor Session Logs**:
   - Check for session cleanup messages in logs
   - Verify session activity tracking

## 🛠️ Debugging Commands

### **Health Check Commands**:
```bash
# Test bot response
/ping

# Check webhook status
curl https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo

# View Railway logs
railway logs

# Check service status
railway status
```

### **Configuration Validation**:
```bash
# Test sheet access
curl -X GET "https://sheets.googleapis.com/v4/spreadsheets/<SHEET_ID>" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

# Validate environment variables
railway variables list
```

### **Manual Testing Flow**:
1. Send `/start` to bot
2. Click "💸 Buy-In"
3. Select payment method
4. Enter amount
5. Verify transaction card appears in group
6. Test "Mark Paid" functionality

## 📊 Monitoring and Alerts

### **Key Metrics to Monitor**:
- Bot response time
- Google Sheets API call success rate
- Payment matching success rate
- Error frequency by type
- Session timeout frequency

### **Recommended Alerts**:
- Bot not responding for >5 minutes
- Google Sheets API error rate >10%
- Payment matching failure rate >20%
- High number of session timeouts

### **Log Analysis**:
```bash
# Search for errors
railway logs | grep "ERROR"

# Search for specific client
railway logs | grep "[CLIENT_NAME]"

# Monitor API calls
railway logs | grep "API call"
```

## 🔒 Security Best Practices

### **Environment Variables**:
- Never commit credentials to version control
- Use Railway dashboard for sensitive variables
- Rotate service account keys regularly
- Use least privilege permissions

### **Access Control**:
- Regularly review `ALLOWED_USER_IDS`
- Monitor unauthorized access attempts
- Use strong, unique bot tokens
- Limit sheet access to service account only

### **Data Protection**:
- Validate all user inputs
- Sanitize payment amounts and methods
- Log security events
- Monitor for suspicious activity

## 🚀 Performance Optimization

### **Rate Limiting**:
- Adjust `SHEETS_RATE_LIMIT_MS` based on usage
- Monitor API quota usage
- Implement exponential backoff for retries

### **Session Management**:
- Optimize `SESSION_TIMEOUT_MS` for your use case
- Monitor memory usage for session storage
- Implement session cleanup for inactive users

### **Message Handling**:
- Use `MAX_MESSAGE_LENGTH` to prevent oversized messages
- Implement message truncation for long content
- Monitor message delivery success rates

## 📞 Support and Escalation

### **When to Escalate**:
- Bot completely unresponsive for >30 minutes
- Payment data corruption or loss
- Security breach or unauthorized access
- High error rate affecting user experience

### **Information to Provide**:
- Client name and bot token
- Error messages and timestamps
- Steps to reproduce the issue
- Recent changes or deployments
- Log excerpts from Railway

### **Emergency Procedures**:
1. **Immediate**: Restart Railway service
2. **Short-term**: Rollback to previous deployment
3. **Long-term**: Investigate root cause and implement fix

---

**Last Updated**: December 2024
**Version**: 2.0.0
**Maintainer**: Pay-n-Play Bot Team
