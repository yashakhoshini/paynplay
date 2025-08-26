import { getClient } from './dist/googleClient.js';
import { google } from 'googleapis';

console.log('🔍 Testing Google Sheets Connection (Updated Client)');
console.log('==================================================');

async function testConnection() {
  try {
    console.log('\n🔐 Getting auth client from src/googleClient.ts...');
    const authClient = await getClient();
    console.log('✅ Auth client created successfully');

    console.log('\n📊 Creating sheets API client...');
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    console.log('✅ Sheets API client created');

    console.log('\n📋 Testing sheet access...');
    const sheetId = process.env.SHEET_ID;
    
    if (!sheetId) {
      throw new Error('SHEET_ID not found in environment variables');
    }

    console.log(`Sheet ID: ${sheetId}`);

    // Test getting spreadsheet metadata
    const response = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
    });

    console.log('✅ SUCCESS: Can access Google Sheet!');
    console.log(`Sheet Title: ${response.data.properties.title}`);
    console.log(`Number of Sheets: ${response.data.sheets.length}`);

    // List available sheets
    if (response.data.sheets && response.data.sheets.length > 0) {
      console.log('\n📋 Available sheets:');
      response.data.sheets.forEach((sheet, index) => {
        console.log(`  ${index + 1}. ${sheet.properties.title}`);
      });
    }

    // Test reading data from first sheet
    console.log('\n📖 Testing data reading...');
    const firstSheet = response.data.sheets[0];
    const sheetName = firstSheet.properties.title;
    
    const readResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1:Z10`,
    });

    console.log(`✅ SUCCESS: Can read from "${sheetName}"!`);
    console.log(`Data found: ${readResponse.data.values?.length || 0} rows`);

    if (readResponse.data.values && readResponse.data.values.length > 0) {
      console.log('\n📝 Sample data (first 3 rows):');
      readResponse.data.values.slice(0, 3).forEach((row, index) => {
        console.log(`  Row ${index + 1}: ${row.join(' | ')}`);
      });
    }

    console.log('\n🎉 Google Sheets connection test completed successfully!');

  } catch (error) {
    console.log('❌ FAILED:', error.message);
    
    if (error.message.includes('Requested entity was not found')) {
      console.log('\n💡 The sheet ID might be incorrect or the sheet might not exist');
    } else if (error.message.includes('Forbidden')) {
      console.log('\n💡 The service account might not have access to this sheet');
      console.log(`   Make sure to share the sheet with: ${process.env.GOOGLE_CLIENT_EMAIL}`);
    } else if (error.message.includes('Decoded key still malformed')) {
      console.log('\n💡 The private key format is still incorrect - regenerate the service account key');
    } else if (error.message.includes('DECODER routines::unsupported')) {
      console.log('\n💡 The private key format is not compatible - check the PEM format');
    }
    
    process.exit(1);
  }
}

testConnection();
