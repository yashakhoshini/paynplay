// Simple Google Sheets Access Test
import { google } from 'googleapis';

console.log('=== Simple Google Sheets Access Test ===\n');

// Load environment variables manually
import 'dotenv/config';

const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

console.log('Configuration:');
console.log(`SHEET_ID: ${SHEET_ID ? 'SET' : 'MISSING'}`);
console.log(`GOOGLE_CLIENT_EMAIL: ${GOOGLE_CLIENT_EMAIL ? 'SET' : 'MISSING'}`);
console.log(`GOOGLE_PRIVATE_KEY: ${GOOGLE_PRIVATE_KEY ? 'SET' : 'MISSING'}`);

if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
  console.log('\n❌ Missing required configuration');
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
  
  // Test reading from Withdrawals tab
  console.log('\nTesting Withdrawals tab access...');
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Withdrawals!A1:L1'
    });
    
    console.log('✅ SUCCESS: Can read from Withdrawals tab!');
    console.log(`Headers found: ${response.data.values?.[0]?.length || 0} columns`);
    
    if (response.data.values && response.data.values[0]) {
      console.log('\nColumn headers:');
      response.data.values[0].forEach((header, index) => {
        console.log(`  ${index + 1}. ${header}`);
      });
    }
  } catch (error) {
    console.log('❌ Cannot read from Withdrawals tab');
    console.log(`Error: ${error.message}`);
    
    if (error.message.includes('Unable to parse range')) {
      console.log('\n💡 This means the Withdrawals tab doesn\'t exist yet');
      console.log('The bot will create it automatically when needed');
    }
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
}

console.log('\n=== Test Complete ===');
