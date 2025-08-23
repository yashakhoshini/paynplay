// Test script to verify Google Sheets access and logic
import { validateSheetAccess, getSettingsCached, getOpenCircleCashoutsCached } from './dist/sheets.js';
import { SHEET_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, CLIENT_NAME } from './dist/config.js';

console.log('=== Google Sheets Access Test ===\n');

// Test 1: Configuration Check
console.log('1. 🔧 Configuration Check:');
console.log(`   ✓ SHEET_ID: ${SHEET_ID ? 'SET' : 'MISSING'}`);
console.log(`   ✓ GOOGLE_CLIENT_EMAIL: ${GOOGLE_CLIENT_EMAIL ? 'SET' : 'MISSING'}`);
console.log(`   ✓ GOOGLE_PRIVATE_KEY: ${GOOGLE_PRIVATE_KEY ? 'SET' : 'MISSING'}`);
console.log(`   ✓ CLIENT_NAME: ${CLIENT_NAME}`);

if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
  console.log('\n❌ Missing required Google Sheets configuration!');
  console.log('Please set SHEET_ID, GOOGLE_CLIENT_EMAIL, and GOOGLE_PRIVATE_KEY in your .env file');
  process.exit(1);
}

// Test 2: Sheet Access Validation
console.log('\n2. 🔐 Testing Sheet Access...');
try {
  const canAccess = await validateSheetAccess();
  if (canAccess) {
    console.log('   ✅ SUCCESS: Bot can access the Google Sheet');
  } else {
    console.log('   ❌ FAILED: Bot cannot access the Google Sheet');
    process.exit(1);
  }
} catch (error) {
  console.log('   ❌ ERROR: Failed to validate sheet access');
  console.log(`   Error: ${error.message}`);
  process.exit(1);
}

// Test 3: Settings Retrieval
console.log('\n3. ⚙️ Testing Settings Retrieval...');
try {
  const settings = await getSettingsCached();
  console.log('   ✅ SUCCESS: Retrieved settings from sheet');
  console.log(`   ✓ CLUB_NAME: ${settings.CLUB_NAME}`);
  console.log(`   ✓ METHODS_ENABLED: ${settings.METHODS_ENABLED.join(', ')}`);
  console.log(`   ✓ CURRENCY: ${settings.CURRENCY}`);
  console.log(`   ✓ FAST_FEE_PCT: ${settings.FAST_FEE_PCT}`);
} catch (error) {
  console.log('   ⚠️ WARNING: Failed to retrieve settings, using defaults');
  console.log(`   Error: ${error.message}`);
}

// Test 4: Withdrawals Data Retrieval
console.log('\n4. 💰 Testing Withdrawals Data Retrieval...');
try {
  const withdrawals = await getOpenCircleCashoutsCached();
  console.log(`   ✅ SUCCESS: Retrieved ${withdrawals.length} open circle withdrawals`);
  
  if (withdrawals.length > 0) {
    console.log('   Sample withdrawal data:');
    const sample = withdrawals[0];
    console.log(`   - request_id: ${sample.request_id}`);
    console.log(`   - user_id: ${sample.user_id}`);
    console.log(`   - username: ${sample.username}`);
    console.log(`   - amount: $${sample.amount}`);
    console.log(`   - method: ${sample.method}`);
    console.log(`   - status: ${sample.status}`);
    console.log(`   - payout_type: ${sample.payout_type}`);
  }
} catch (error) {
  console.log('   ⚠️ WARNING: Failed to retrieve withdrawals data');
  console.log(`   Error: ${error.message}`);
}

// Test 5: Sheet Structure Analysis
console.log('\n5. 📊 Sheet Structure Analysis:');
console.log('   Based on the Google Sheet template, the bot expects:');
console.log('   ✓ Withdrawals tab with columns: request_id, user_id, username, amount, method, payment_tag_or_address, request_timestamp_iso, approved_by_user_id, approved_at_iso, status, payout_type, notes');
console.log('   ✓ Settings tab with columns: key, value (optional)');
console.log('   ✓ Owner Payouts tab with columns: payout_id, user_id, username, amount_usd, channel, owner_wallet_or_handle, request_timestamp_iso, paid_at_iso, status, notes (auto-created)');

console.log('\n=== 🎉 Google Sheets Test Complete! ===');
console.log('\nThe bot appears to be working correctly with Google Sheets if:');
console.log('✅ All configuration variables are set');
console.log('✅ Sheet access validation passes');
console.log('✅ Settings can be retrieved (or fallback to defaults)');
console.log('✅ Withdrawals data can be read');

console.log('\nIf you see any ❌ errors above, please:');
console.log('1. Check your Google Service Account credentials');
console.log('2. Verify the SHEET_ID is correct');
console.log('3. Ensure the service account has edit access to the sheet');
console.log('4. Check that the sheet has the required tabs and columns');
