import dotenv from 'dotenv';
import { google } from 'googleapis';

// Load environment variables
dotenv.config();

console.log('🔍 Google Sheets Connection Test (Fixed)');
console.log('========================================');

// Check environment variables
console.log('\n📋 Environment Variables Check:');
const sheetId = process.env.SHEET_ID;
const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
const privateKeyB64 = process.env.GOOGLE_PRIVATE_KEY_B64;
const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;

console.log(`✅ SHEET_ID: ${sheetId ? 'SET' : 'MISSING'}`);
console.log(`✅ GOOGLE_CLIENT_EMAIL: ${clientEmail ? 'SET' : 'MISSING'}`);
console.log(`✅ GOOGLE_PRIVATE_KEY_B64: ${privateKeyB64 ? 'SET (' + privateKeyB64.length + ' chars)' : 'MISSING'}`);
console.log(`✅ GOOGLE_PRIVATE_KEY: ${privateKeyRaw ? 'SET' : 'MISSING'}`);

if (!sheetId || !clientEmail || (!privateKeyB64 && !privateKeyRaw)) {
  console.log('\n❌ Missing required Google Sheets configuration!');
  console.log('Please ensure SHEET_ID, GOOGLE_CLIENT_EMAIL, and either GOOGLE_PRIVATE_KEY_B64 or GOOGLE_PRIVATE_KEY are set');
  process.exit(1);
}

// Decode private key using the same logic as config.ts
console.log('\n🔐 Decoding Private Key...');
function decodePrivateKey(): string {
  const b64 = process.env.GOOGLE_PRIVATE_KEY_B64 || '';
  const raw = process.env.GOOGLE_PRIVATE_KEY || '';

  if (b64) {
    try {
      const decoded = Buffer.from(b64, 'base64').toString('utf8').trim();
      console.log('✅ Private key decoded from base64 successfully');
      return decoded;
    } catch (e) {
      console.log('❌ Failed to decode base64 private key:', e.message);
      throw new Error('GOOGLE_PRIVATE_KEY_B64 could not be base64-decoded.');
    }
  }

  // Fallback for legacy \n style
  if (raw) {
    const decoded = raw
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\r\n/g, '\n')
      .trim();
    console.log('✅ Private key processed from raw format successfully');
    return decoded;
  }

  return '';
}

let privateKey;
try {
  privateKey = decodePrivateKey();
  
  // Validate private key format
  const first = privateKey.split('\n')[0]?.trim();
  const last = privateKey.split('\n').slice(-1)[0]?.trim();
  
  if (first !== '-----BEGIN PRIVATE KEY-----' || last !== '-----END PRIVATE KEY-----') {
    console.log('❌ Private key appears malformed (BEGIN/END lines not found exactly)');
    console.log(`First line: ${first}`);
    console.log(`Last line: ${last}`);
    process.exit(1);
  }
  
  console.log('✅ Private key format validated successfully');
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
