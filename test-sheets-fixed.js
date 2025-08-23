// Fixed Google Sheets Access Test
import { google } from 'googleapis';

console.log('=== Fixed Google Sheets Access Test ===\n');

// Load environment variables manually
import 'dotenv/config';

const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY_B64 = process.env.GOOGLE_PRIVATE_KEY_B64;

console.log('Configuration:');
console.log(`SHEET_ID: ${SHEET_ID ? 'SET' : 'MISSING'}`);
console.log(`GOOGLE_CLIENT_EMAIL: ${GOOGLE_CLIENT_EMAIL ? 'SET' : 'MISSING'}`);
console.log(`GOOGLE_PRIVATE_KEY_B64: ${GOOGLE_PRIVATE_KEY_B64 ? 'SET' : 'MISSING'}`);

if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY_B64) {
  console.log('\n❌ Missing required configuration');
  process.exit(1);
}

// Decode the private key
console.log('\nDecoding private key...');
let GOOGLE_PRIVATE_KEY;
try {
  GOOGLE_PRIVATE_KEY = Buffer.from(GOOGLE_PRIVATE_KEY_B64, 'base64').toString('utf8');
  console.log('✅ Private key decoded successfully');
} catch (error) {
  console.log('❌ Failed to decode private key:', error.message);
  process.exit(1);
}

console.log('\nTesting Google Sheets access...');

try {
  // Create auth client
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    credentials: {
      client_email: GOOGLE_CLIENT_EMAIL,
      private_key: GOOGLE_PRIVATE_KEY
    }
  });
  
  console.log('✅ Auth client created successfully');
  
  const authClient = await auth.getClient();
  console.log('✅ Auth client initialized');
  
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  console.log('✅ Sheets API client created');
  
  // Test basic access
  console.log('\nTesting sheet access...');
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  
  console.log('✅ SUCCESS: Can access Google Sheet!');
  console.log(`Sheet Title: ${meta.data.properties?.title || 'Untitled'}`);
  console.log(`Number of Tabs: ${meta.data.sheets?.length || 0}`);
  
  if (meta.data.sheets && meta.data.sheets.length > 0) {
    console.log('\nAvailable Tabs:');
    meta.data.sheets.forEach((sheet, index) => {
      console.log(`  ${index + 1}. ${sheet.properties?.title}`);
    });
  }
  
  // Test reading from the first sheet
  console.log('\nTesting data reading...');
  try {
    const firstSheet = meta.data.sheets[0];
    const sheetName = firstSheet.properties?.title || 'Sheet1';
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A1:Z10`
    });
    
    console.log(`✅ SUCCESS: Can read from "${sheetName}"!`);
    console.log(`Data found: ${response.data.values?.length || 0} rows`);
    
    if (response.data.values && response.data.values.length > 0) {
      console.log('\nSample data (first 3 rows):');
      response.data.values.slice(0, 3).forEach((row, index) => {
        console.log(`  Row ${index + 1}: ${row.join(' | ')}`);
      });
    }
  } catch (error) {
    console.log('❌ Cannot read data from sheet');
    console.log(`Error: ${error.message}`);
  }
  
} catch (error) {
  console.log('❌ FAILED: Cannot access Google Sheets');
  console.log(`Error: ${error.message}`);
  
  if (error.message.includes('Requested entity was not found')) {
    console.log('\n💡 Solution: Share the Google Sheet with the service account');
    console.log(`Share with: ${GOOGLE_CLIENT_EMAIL}`);
    console.log('Give it Editor permissions');
  } else if (error.message.includes('Forbidden')) {
    console.log('\n💡 Solution: Service account needs Editor permissions');
    console.log(`Share with: ${GOOGLE_CLIENT_EMAIL}`);
  } else if (error.message.includes('Google Sheets API has not been used')) {
    console.log('\n💡 Solution: Enable Google Sheets API in Google Cloud Console');
  } else if (error.message.includes('invalid_grant')) {
    console.log('\n💡 Solution: Check your private key format');
  }
  
  process.exit(1);
}

console.log('\n🎉 Google Sheets connection test completed successfully!');
