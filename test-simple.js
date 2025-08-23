import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { google } from 'googleapis';

console.log('=== Simple Google Sheets Test ===');

// Get environment variables
const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
const privateKeyB64 = process.env.GOOGLE_PRIVATE_KEY_B64;
const sheetId = process.env.SHEET_ID;

console.log('Client Email:', clientEmail ? 'SET' : 'MISSING');
console.log('Private Key B64:', privateKeyB64 ? 'SET' : 'MISSING');
console.log('Sheet ID:', sheetId ? 'SET' : 'MISSING');

if (!clientEmail || !privateKeyB64 || !sheetId) {
    console.log('❌ Missing required environment variables');
    process.exit(1);
}

// Decode the private key
let privateKey;
try {
    privateKey = Buffer.from(privateKeyB64, 'base64').toString('utf8').trim();
    console.log('✅ Private key decoded successfully');
} catch (error) {
    console.log('❌ Failed to decode private key:', error.message);
    process.exit(1);
}

// Create auth client
const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: clientEmail,
        private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// Test connection
async function testConnection() {
    try {
        console.log('\nTesting Google Sheets connection...');
        const authClient = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: authClient });
        
        // Get sheet metadata
        const response = await sheets.spreadsheets.get({
            spreadsheetId: sheetId,
            ranges: [],
            includeGridData: false
        });
        
        console.log('✅ SUCCESS: Connected to Google Sheets!');
        console.log('Sheet title:', response.data.properties.title);
        console.log('Sheet ID:', response.data.spreadsheetId);
        console.log('Number of sheets:', response.data.sheets?.length || 0);
        
    } catch (error) {
        console.log('❌ FAILED:', error.message);
        if (error.message.includes('DECODER')) {
            console.log('This is a private key format issue');
        }
    }
}

testConnection();
