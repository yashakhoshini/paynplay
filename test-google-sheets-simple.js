import dotenv from 'dotenv';
import { google } from 'googleapis';

// Load environment variables
dotenv.config();

console.log('🔍 Google Sheets Connection Test');
console.log('================================');

// Check environment variables
console.log('\n📋 Environment Variables Check:');
const sheetId = process.env.SHEET_ID;
const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
const privateKeyB64 = process.env.GOOGLE_PRIVATE_KEY_B64;

console.log(`✅ SHEET_ID: ${sheetId ? 'SET' : 'MISSING'}`);
console.log(`✅ GOOGLE_CLIENT_EMAIL: ${clientEmail ? 'SET' : 'MISSING'}`);
console.log(`✅ GOOGLE_PRIVATE_KEY_B64: ${privateKeyB64 ? 'SET (' + privateKeyB64.length + ' chars)' : 'MISSING'}`);

if (!sheetId || !clientEmail || !privateKeyB64) {
  console.log('\n❌ Missing required Google Sheets configuration!');
  console.log('Please ensure SHEET_ID, GOOGLE_CLIENT_EMAIL, and GOOGLE_PRIVATE_KEY_B64 are set in your .env file');
  process.exit(1);
}

// Decode private key
console.log('\n🔐 Decoding Private Key...');
let privateKey;
try {
  privateKey = Buffer.from(privateKeyB64, 'base64').toString('utf8');
  console.log('✅ Private key decoded successfully');
} catch (error) {
  console.log('❌ Failed to decode private key:', error.message);
  process.exit(1);
}

// Create Google Auth client
console.log('\n🔑 Creating Google Auth Client...');
try {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  console.log('✅ Google Auth client created successfully');

  // Test authentication
  console.log('\n🔐 Testing Authentication...');
  const authClient = await auth.getClient();
  console.log('✅ Authentication successful');

  // Create Google Sheets API client
  console.log('\n📊 Creating Google Sheets API Client...');
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  console.log('✅ Google Sheets API client created');

  // Test sheet access
  console.log('\n📋 Testing Sheet Access...');
  try {
    const response = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
    });

    console.log('✅ SUCCESS: Can access the Google Sheet!');
    console.log(`📄 Sheet Title: ${response.data.properties.title}`);
    console.log(`📊 Number of Sheets: ${response.data.sheets.length}`);
    
    // List available sheets
    console.log('\n📋 Available Sheets:');
    response.data.sheets.forEach((sheet, index) => {
      console.log(`  ${index + 1}. ${sheet.properties.title}`);
    });

    // Test reading from the first sheet
    console.log('\n📖 Testing Data Reading...');
    const firstSheet = response.data.sheets[0];
    const sheetName = firstSheet.properties.title;
    
    const readResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1:Z10`,
    });

    console.log(`✅ SUCCESS: Can read data from "${sheetName}"`);
    console.log(`📊 Found ${readResponse.data.values ? readResponse.data.values.length : 0} rows of data`);
    
    if (readResponse.data.values && readResponse.data.values.length > 0) {
      console.log('\n📝 Sample data (first 3 rows):');
      readResponse.data.values.slice(0, 3).forEach((row, index) => {
        console.log(`  Row ${index + 1}: ${row.join(' | ')}`);
      });
    }

  } catch (error) {
    console.log('❌ FAILED: Cannot access the Google Sheet');
    console.log(`Error: ${error.message}`);
    
    if (error.code === 404) {
      console.log('💡 The sheet ID might be incorrect or the sheet might not exist');
    } else if (error.code === 403) {
      console.log('💡 The service account might not have access to this sheet');
      console.log('   Make sure to share the sheet with the service account email');
    }
    
    process.exit(1);
  }

} catch (error) {
  console.log('❌ FAILED: Could not create Google Auth client');
  console.log(`Error: ${error.message}`);
  process.exit(1);
}

console.log('\n🎉 Google Sheets Connection Test Complete!');
console.log('\n✅ All tests passed! Your Google Sheets integration is working correctly.');
console.log('\nNext steps:');
console.log('1. Make sure your sheet has the required tabs (Withdrawals, Settings, etc.)');
console.log('2. Ensure the service account has edit permissions');
console.log('3. Test the bot functionality');
