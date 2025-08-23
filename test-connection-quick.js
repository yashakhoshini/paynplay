import dotenv from 'dotenv';
import { GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY_PEM } from './src/config.js';

dotenv.config();

console.log('=== Quick Connection Test ===');

// Check environment variables
console.log('GOOGLE_CLIENT_EMAIL:', GOOGLE_CLIENT_EMAIL ? 'SET' : 'MISSING');
console.log('GOOGLE_PRIVATE_KEY_PEM:', GOOGLE_PRIVATE_KEY_PEM ? 'SET' : 'MISSING');

if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY_PEM) {
    console.log('❌ Missing required environment variables');
    process.exit(1);
}

// Test connection using the new Google client
async function testConnection() {
    try {
        console.log('\nTesting connection...');
        
        // Import the Google client
        const { getClient } = await import('./src/googleClient.js');
        const authClient = await getClient();
        
        // Test with a simple sheets call
        const { google } = await import('googleapis');
        const sheets = google.sheets({ version: 'v4', auth: authClient as any });
        
        // Get sheet metadata
        const response = await sheets.spreadsheets.get({
            spreadsheetId: process.env.SHEET_ID,
            ranges: [],
            includeGridData: false
        });
        
        console.log('✅ SUCCESS: Connected to Google Sheets!');
        console.log('Sheet title:', response.data.properties.title);
        console.log('Sheet ID:', response.data.spreadsheetId);
        
    } catch (error) {
        console.log('❌ FAILED:', error.message);
        if (error.message.includes('DECODER')) {
            console.log('This is a private key format issue');
        }
    }
}

testConnection();
