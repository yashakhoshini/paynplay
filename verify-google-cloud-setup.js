// Google Cloud Service Account Verification Script
import { google } from 'googleapis';
import { SHEET_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, CLIENT_NAME } from './dist/config.js';

console.log('=== Google Cloud Service Account Verification ===\n');

// Test 1: Environment Variables Check
console.log('1. 🔧 Environment Variables Check:');
console.log(`   ✓ SHEET_ID: ${SHEET_ID ? 'SET' : 'MISSING'}`);
console.log(`   ✓ GOOGLE_CLIENT_EMAIL: ${GOOGLE_CLIENT_EMAIL ? 'SET' : 'MISSING'}`);
console.log(`   ✓ GOOGLE_PRIVATE_KEY: ${GOOGLE_PRIVATE_KEY ? 'SET' : 'MISSING'}`);

if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
  console.log('\n❌ Missing required configuration!');
  console.log('\nTo fix this, you need to:');
  console.log('1. Create a .env file in the project root');
  console.log('2. Add these variables:');
  console.log(`   SHEET_ID=1Xs-4ZIpt87XcS6rBCtXkczSB0hLUExK1`);
  console.log(`   GOOGLE_CLIENT_EMAIL=your-service-account@stoked-aloe-468800-d8.iam.gserviceaccount.com`);
  console.log(`   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"`);
  process.exit(1);
}

// Test 2: Service Account Authentication
console.log('\n2. 🔐 Testing Service Account Authentication...');
try {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    credentials: {
      client_email: GOOGLE_CLIENT_EMAIL,
      private_key: GOOGLE_PRIVATE_KEY
    }
  });
  
  const authClient = await auth.getClient();
  console.log('   ✅ SUCCESS: Service account authentication works');
  console.log(`   ✓ Service Account Email: ${GOOGLE_CLIENT_EMAIL}`);
  
  // Get project info
  const projectId = GOOGLE_CLIENT_EMAIL.split('@')[1].split('.')[0];
  console.log(`   ✓ Project ID: ${projectId}`);
  
} catch (error) {
  console.log('   ❌ FAILED: Service account authentication failed');
  console.log(`   Error: ${error.message}`);
  
  if (error.message.includes('invalid_grant')) {
    console.log('\n💡 This usually means:');
    console.log('   - The private key is incorrect or malformed');
    console.log('   - The service account was deleted or disabled');
    console.log('   - The private key has expired');
  } else if (error.message.includes('invalid_client')) {
    console.log('\n💡 This usually means:');
    console.log('   - The client_email is incorrect');
    console.log('   - The service account doesn\'t exist');
  }
  
  process.exit(1);
}

// Test 3: Google Sheets API Access
console.log('\n3. 📊 Testing Google Sheets API Access...');
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
  
  // Try to access the specific sheet
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  console.log('   ✅ SUCCESS: Can access Google Sheets API');
  console.log(`   ✓ Sheet Title: ${meta.data.properties?.title || 'Untitled'}`);
  console.log(`   ✓ Sheet ID: ${SHEET_ID}`);
  console.log(`   ✓ Number of Tabs: ${meta.data.sheets?.length || 0}`);
  
  // List available tabs
  if (meta.data.sheets && meta.data.sheets.length > 0) {
    console.log('   ✓ Available Tabs:');
    meta.data.sheets.forEach((sheet, index) => {
      console.log(`     ${index + 1}. ${sheet.properties?.title}`);
    });
  }
  
} catch (error) {
  console.log('   ❌ FAILED: Cannot access Google Sheets API');
  console.log(`   Error: ${error.message}`);
  
  if (error.message.includes('Requested entity was not found')) {
    console.log('\n💡 This means:');
    console.log('   - The SHEET_ID is incorrect');
    console.log('   - The sheet was deleted or moved');
    console.log('   - The service account doesn\'t have access to this sheet');
  } else if (error.message.includes('Forbidden')) {
    console.log('\n💡 This means:');
    console.log('   - The service account doesn\'t have permission to access this sheet');
    console.log('   - You need to share the sheet with the service account email');
  } else if (error.message.includes('Google Sheets API has not been used')) {
    console.log('\n💡 This means:');
    console.log('   - Google Sheets API is not enabled in your Google Cloud project');
    console.log('   - Go to Google Cloud Console > APIs & Services > Library');
    console.log('   - Search for "Google Sheets API" and enable it');
  }
  
  process.exit(1);
}

// Test 4: Sheet Permissions Check
console.log('\n4. 🔑 Testing Sheet Permissions...');
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
  
  // Try to read from the Withdrawals tab
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Withdrawals!A1:L1' // Just read headers
  });
  
  console.log('   ✅ SUCCESS: Can read from Withdrawals tab');
  console.log(`   ✓ Headers found: ${response.data.values?.[0]?.length || 0} columns`);
  
  if (response.data.values && response.data.values[0]) {
    console.log('   ✓ Column headers:');
    response.data.values[0].forEach((header, index) => {
      console.log(`     ${index + 1}. ${header}`);
    });
  }
  
} catch (error) {
  console.log('   ❌ FAILED: Cannot read from Withdrawals tab');
  console.log(`   Error: ${error.message}`);
  
  if (error.message.includes('Unable to parse range')) {
    console.log('\n💡 This means:');
    console.log('   - The "Withdrawals" tab doesn\'t exist in the sheet');
    console.log('   - The tab name is different (check for typos)');
  }
}

// Test 5: Write Permission Check
console.log('\n5. ✍️ Testing Write Permissions...');
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
  
  // Try to write a test cell (we'll clean it up)
  const testRange = 'Withdrawals!A999';
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: testRange,
    valueInputOption: 'RAW',
    requestBody: { values: [['TEST_WRITE_PERMISSION']] }
  });
  
  // Clean up the test cell
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: testRange
  });
  
  console.log('   ✅ SUCCESS: Can write to sheet');
  
} catch (error) {
  console.log('   ❌ FAILED: Cannot write to sheet');
  console.log(`   Error: ${error.message}`);
  
  if (error.message.includes('Forbidden')) {
    console.log('\n💡 This means:');
    console.log('   - The service account has read-only access');
    console.log('   - You need to give "Editor" permissions to the service account');
  }
}

console.log('\n=== 🎉 Google Cloud Setup Verification Complete! ===');
console.log('\nNext Steps:');
console.log('1. If all tests passed ✅: Your setup is working correctly!');
console.log('2. If you see ❌ errors: Follow the suggestions above to fix them');
console.log('3. Run the bot: npm start or node dist/index.js');
console.log('4. Test with real data in your Google Sheet');

console.log('\nCommon Issues & Solutions:');
console.log('• "Service account not found": Create a new service account in Google Cloud Console');
console.log('• "API not enabled": Enable Google Sheets API in APIs & Services > Library');
console.log('• "Permission denied": Share the sheet with the service account email');
console.log('• "Invalid credentials": Download a fresh JSON key from the service account');
