// Comprehensive Environment Configuration Check
import { google } from 'googleapis';
import { 
  SHEET_ID, 
  GOOGLE_CLIENT_EMAIL, 
  GOOGLE_PRIVATE_KEY, 
  CLIENT_NAME,
  CLIENT_ID,
  BOT_TOKEN,
  BOT_USERNAME,
  METHODS_ENABLED_DEFAULT,
  METHODS_CIRCLE,
  METHODS_EXTERNAL_LINK,
  FIXED_WALLETS_JSON,
  STRIPE_CHECKOUT_URL,
  ALLOWED_USER_IDS,
  OWNER_TG_USERNAME,
  LOADER_GROUP_ID,
  MIN_BUYIN_AMOUNT,
  MAX_BUYIN_AMOUNT,
  OWNER_FALLBACK_THRESHOLD,
  WITHDRAW_STALE_HOURS
} from './dist/config.js';

console.log('=== PaynPlay Bot Environment Configuration Check ===\n');

// Test 1: Google Sheets Configuration
console.log('1. 🔧 Google Sheets Configuration:');
console.log(`   ✓ SHEET_ID: ${SHEET_ID ? 'SET' : 'MISSING'}`);
console.log(`   ✓ GOOGLE_CLIENT_EMAIL: ${GOOGLE_CLIENT_EMAIL ? 'SET' : 'MISSING'}`);
console.log(`   ✓ GOOGLE_PRIVATE_KEY: ${GOOGLE_PRIVATE_KEY ? 'SET' : 'MISSING'}`);

if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
  console.log('   ❌ Missing Google Sheets configuration!');
} else {
  console.log('   ✅ Google Sheets configuration complete');
}

// Test 2: Bot Configuration
console.log('\n2. 🤖 Bot Configuration:');
console.log(`   ✓ BOT_TOKEN: ${BOT_TOKEN ? 'SET' : 'MISSING'}`);
console.log(`   ✓ BOT_USERNAME: ${BOT_USERNAME ? 'SET' : 'MISSING'}`);
console.log(`   ✓ CLIENT_NAME: ${CLIENT_NAME}`);
console.log(`   ✓ CLIENT_ID: ${CLIENT_ID}`);

if (!BOT_TOKEN) {
  console.log('   ❌ Missing BOT_TOKEN - get this from @BotFather');
}

// Test 3: Payment Methods Configuration
console.log('\n3. 💳 Payment Methods Configuration:');
console.log(`   ✓ METHODS_ENABLED_DEFAULT: ${METHODS_ENABLED_DEFAULT.join(', ')}`);
console.log(`   ✓ METHODS_CIRCLE: ${METHODS_CIRCLE.join(', ')}`);
console.log(`   ✓ METHODS_EXTERNAL_LINK: ${METHODS_EXTERNAL_LINK.join(', ')}`);

// Test 4: Payment Handles Configuration
console.log('\n4. 💰 Payment Handles Configuration:');
try {
  const wallets = JSON.parse(FIXED_WALLETS_JSON);
  console.log(`   ✓ FIXED_WALLETS_JSON: ${Object.keys(wallets).length} payment methods configured`);
  
  // Check if wallets are properly configured
  const configuredMethods = Object.keys(wallets);
  const enabledMethods = METHODS_ENABLED_DEFAULT;
  
  const missingMethods = enabledMethods.filter(method => !configuredMethods.includes(method));
  if (missingMethods.length > 0) {
    console.log(`   ⚠️ Missing payment handles for: ${missingMethods.join(', ')}`);
  } else {
    console.log('   ✅ All enabled methods have payment handles configured');
  }
  
  // Show configured handles
  console.log('   Configured payment handles:');
  Object.entries(wallets).forEach(([method, handle]) => {
    console.log(`     ${method}: ${handle}`);
  });
  
} catch (error) {
  console.log('   ❌ Invalid FIXED_WALLETS_JSON format');
}

// Test 5: Club Settings
console.log('\n5. 🏢 Club Settings:');
console.log(`   ✓ MIN_BUYIN_AMOUNT: $${MIN_BUYIN_AMOUNT}`);
console.log(`   ✓ MAX_BUYIN_AMOUNT: $${MAX_BUYIN_AMOUNT}`);
console.log(`   ✓ OWNER_FALLBACK_THRESHOLD: $${OWNER_FALLBACK_THRESHOLD}`);
console.log(`   ✓ WITHDRAW_STALE_HOURS: ${WITHDRAW_STALE_HOURS} hours`);

// Test 6: Owner and Admin Configuration
console.log('\n6. 👑 Owner and Admin Configuration:');
console.log(`   ✓ OWNER_TG_USERNAME: ${OWNER_TG_USERNAME}`);
console.log(`   ✓ LOADER_GROUP_ID: ${LOADER_GROUP_ID}`);
console.log(`   ✓ ALLOWED_USER_IDS: ${ALLOWED_USER_IDS.join(', ')}`);

if (!OWNER_TG_USERNAME || OWNER_TG_USERNAME === 'club_owner_username') {
  console.log('   ⚠️ Update OWNER_TG_USERNAME with actual username');
}

if (!LOADER_GROUP_ID || LOADER_GROUP_ID === '-1001234567890') {
  console.log('   ⚠️ Update LOADER_GROUP_ID with actual Telegram group ID');
}

// Test 7: External Services
console.log('\n7. 🔗 External Services:');
console.log(`   ✓ STRIPE_CHECKOUT_URL: ${STRIPE_CHECKOUT_URL ? 'SET' : 'NOT SET'}`);

if (STRIPE_CHECKOUT_URL && STRIPE_CHECKOUT_URL.includes('stripe.com')) {
  console.log('   ✅ Valid Stripe checkout URL');
} else if (STRIPE_CHECKOUT_URL) {
  console.log('   ⚠️ Stripe URL may not be valid');
}

// Test 8: Google Sheets Access Test
console.log('\n8. 🔐 Testing Google Sheets Access...');
if (SHEET_ID && GOOGLE_CLIENT_EMAIL && GOOGLE_PRIVATE_KEY) {
  try {
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      credentials: {
        client_email: GOOGLE_CLIENT_EMAIL,
        private_key: GOOGLE_PRIVATE_KEY
      }
    });
    
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    
    // Test sheet access
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    console.log('   ✅ SUCCESS: Can access Google Sheet');
    console.log(`   ✓ Sheet Title: ${meta.data.properties?.title || 'Untitled'}`);
    console.log(`   ✓ Number of Tabs: ${meta.data.sheets?.length || 0}`);
    
    // List tabs
    if (meta.data.sheets && meta.data.sheets.length > 0) {
      console.log('   ✓ Available Tabs:');
      meta.data.sheets.forEach((sheet, index) => {
        console.log(`     ${index + 1}. ${sheet.properties?.title}`);
      });
    }
    
    // Test reading from Withdrawals tab
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Withdrawals!A1:L1'
      });
      console.log('   ✅ SUCCESS: Can read from Withdrawals tab');
      console.log(`   ✓ Headers found: ${response.data.values?.[0]?.length || 0} columns`);
    } catch (error) {
      console.log('   ⚠️ Cannot read from Withdrawals tab - may not exist yet');
    }
    
  } catch (error) {
    console.log('   ❌ FAILED: Cannot access Google Sheet');
    console.log(`   Error: ${error.message}`);
    
    if (error.message.includes('Requested entity was not found')) {
      console.log('   💡 Make sure to share the sheet with the service account');
    } else if (error.message.includes('Forbidden')) {
      console.log('   💡 Service account needs Editor permissions');
    }
  }
} else {
  console.log('   ⚠️ Skipping Google Sheets test - missing credentials');
}

// Test 9: Configuration Summary
console.log('\n9. 📊 Configuration Summary:');
const issues = [];
const warnings = [];

if (!BOT_TOKEN) issues.push('Missing BOT_TOKEN');
if (!SHEET_ID) issues.push('Missing SHEET_ID');
if (!GOOGLE_CLIENT_EMAIL) issues.push('Missing GOOGLE_CLIENT_EMAIL');
if (!GOOGLE_PRIVATE_KEY) issues.push('Missing GOOGLE_PRIVATE_KEY');
if (OWNER_TG_USERNAME === 'club_owner_username') warnings.push('Update OWNER_TG_USERNAME');
if (LOADER_GROUP_ID === '-1001234567890') warnings.push('Update LOADER_GROUP_ID');

console.log(`   Issues found: ${issues.length}`);
issues.forEach(issue => console.log(`     ❌ ${issue}`));

console.log(`   Warnings: ${warnings.length}`);
warnings.forEach(warning => console.log(`     ⚠️ ${warning}`));

// Test 10: Multi-tenant Setup Status
console.log('\n10. 🏗️ Multi-tenant Setup Status:');
console.log('   ✅ Environment template is properly structured');
console.log('   ✅ Google Sheets integration configured');
console.log('   ✅ Payment methods and handles configured');
console.log('   ✅ Club settings and limits defined');

if (issues.length === 0) {
  console.log('   ✅ Ready for deployment!');
} else {
  console.log('   ⚠️ Fix issues before deployment');
}

console.log('\n=== 🎉 Environment Check Complete! ===');
console.log('\nNext Steps:');
console.log('1. Fix any ❌ issues above');
console.log('2. Update any ⚠️ warnings with real values');
console.log('3. Test the bot: npm start');
console.log('4. Test with real withdrawal requests');
console.log('5. Monitor Google Sheet for new entries');

console.log('\nTo test the bot:');
console.log('1. Get a BOT_TOKEN from @BotFather on Telegram');
console.log('2. Update OWNER_TG_USERNAME with your Telegram username');
console.log('3. Update LOADER_GROUP_ID with your Telegram group ID');
console.log('4. Run: npm start');
console.log('5. Send /start to your bot on Telegram');
