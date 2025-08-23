import dotenv from 'dotenv';
import { google } from 'googleapis';

// Load environment variables
dotenv.config();

console.log('🔍 Simple Google Sheets Test');
console.log('============================');

// Check environment variables
console.log('\n📋 Environment Variables:');
const sheetId = process.env.SHEET_ID;
const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
const privateKeyB64 = process.env.GOOGLE_PRIVATE_KEY_B64;

console.log(`SHEET_ID: ${sheetId ? 'SET' : 'MISSING'}`);
console.log(`GOOGLE_CLIENT_EMAIL: ${clientEmail ? 'SET' : 'MISSING'}`);
console.log(`GOOGLE_PRIVATE_KEY_B64: ${privateKeyB64 ? 'SET' : 'MISSING'}`);

if (!sheetId || !clientEmail || !privateKeyB64) {
  console.log('\n❌ Missing required configuration!');
  process.exit(1);
}

// Decode private key
console.log('\n🔐 Decoding private key...');
let privateKey;
try {
  privateKey = Buffer.from(privateKeyB64, 'base64').toString('utf8');
  console.log('✅ Private key decoded');
} catch (error) {
  console.log('❌ Failed to decode private key:', error.message);
  process.exit(1);
}

// Create auth client
console.log('\n🔑 Creating auth client...');
try {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const authClient = await auth.getClient();
  console.log('✅ Auth client created');

  // Test sheet access
  console.log('\n📋 Testing sheet access...');
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  
  const response = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
  });

  console.log('✅ SUCCESS! Can access Google Sheet');
  console.log(`Sheet title: ${response.data.properties.title}`);
  console.log(`Number of sheets: ${response.data.sheets.length}`);

} catch (error) {
  console.log('❌ FAILED:', error.message);
  process.exit(1);
}

console.log('\n🎉 Google Sheets connection working!');
