// test-manual-env.js
// Test with manually set environment variables

const { google } = require('googleapis');

// Manually set the environment variables from the .env file
process.env.SHEET_ID = '1AkU3P_zyysK6vHiIrMCbV5QdGxcCvzqwo5hbQ2jL_VM';
process.env.GOOGLE_CLIENT_EMAIL = 'paynplayai@stoked-aloe-468800-d8.iam.gserviceaccount.com';
process.env.GOOGLE_PRIVATE_KEY_B64 = 'LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tXG5NSUlFdlFJQkFEQU5CZ2txaGtpRzl3MEJBUUVGQUFTQ0JLY3dnZ1NqQWdFQUFvSUJBUURIQXJtOERnbXk1R0VUXG5ZK3JXa2ZIbG1wMVZheXgrcXlXL1l5YnhBOTVlRVVKZUF0bjVHUFJjQ29TaXdha0J2SFE5KzhBQmd1Q0dPcG56XG5sL0Z0TUowbWhzVHl6Ujk2TDBUMS8rNlVzWUxVYXdNRGxMckhYc2hMWXE2YjQyVkcwK3o2bS9ZU3lZODB6R281XG5BOHJHNUkrbDhpcWdDQzFEaDYvajBiSXFXU2VzQmZSR0phWGJKQVNERkI1dDZpQWhmbWNMZmtNWG5DcVo0S3ZaXG5LZlJJaGZVWk0xWkpQY1RPNjBRMnplRnF1bFpuMUNMZVJBVVJqWjhWTjk5RDdqZGNRWnE3TFZFWjN0Z0ZXcXlUXG5wVFFxN0dJdTVKNUtjcTZrOERwRU5KT24vc05yMzhJZE55b2w1L09YLzNaNUNtdHhSdGxsSWU0cjVnNm5ScTdRXG5KNElxaW1EekFnTUJBQUVDZ2dFQUhGbE10ZmVBb0RBYzRxaVFFbUxBaFBHTkgxYmdycnZ0NlBaL01lNnRldFJBXG5rbE1icVNWSjRlRkpzRVJLc1VtZTBXN2tQMmd5V0V5a0U1UW9aYmZRR3hDRm9RUzJvQzdObkZ3SjAyVlBVQTBIXG51b3lHNkNielVmSEx2UlJ4SDl3ZWg1Q01uQjZFUE5tRnBDWTF6amFrS1MwaHIweEZqbUlYY2RUZTZWNFdqYVZ4XG4xMEkxZ3E2YnpXa0ZPc1ZmNGJDTXZneml3RHJkVEpjeWROcWQrR3hqOC9qT2p3c0hmb3dPVGw5Z09xNTk0QkVJXG5aQW1OdGs2QmdoMkN6WlhKV0tLai8yUHlmWkNVbmhtTlgrQlYvWHlBNkhFSEYwRUxBU3Q4UTFaTVUxZVlPRzUrXG45UW5taERDSVNNeHhHZEFyUmRzYU1HT3FoZm1OSkt3SHNQem5NeElZRVFLQmdRRGxNd3BIbkQ1T2NuZG9ibmtpXG5UR1lUSEFBb1RYOVljdzJnSnhCNWVRNUY5M1o4UG5YRnBWOEoxYjc4N2xnWEhlbWo2VEhJaitKVkNmM2RqTkhnXG5rbUM4N3RYb3A3SmpFM2syKzRhRUdXOWRCcHE0WXFxbkk2OUh0VzhDTW02alRZRDY1ZDlaMU9UY2p3VEgvaERmXG4wMXpsV09XdkNDdHJYMUJ1RGkxSmFSdk0yd0tCZ1FEZVNBQ0UvSVk3MklWMVFzZ2NWNFRuOFFVbkpQWk9haFhjXG5xb0xHV05UT25IS0Q0eDlZK3VOcU16TVNtNDA0VmZLUVM0aVBETHBQOE5aVXZJaDkvWFdBamV3SEh4VjdSMlV1XG5KaDRSNHU1WDRZMHgxQklVUW1GcjFKNGxJRHFTazM4RDlYcmU4ckxFbGxGNVc0WVkrL2dldGk1S2wrbXVYTXcwXG5uQUpzdjNWcnlRS0JnRERIbUJ4OWlGVXh6M0FPY3dGMXVSUEFGZGgrQmVoUk5Fa3RoemdUSjVLRWhGY1ZCQU80XG5tbTJCYkZCd2VaY1I2clBUNGFDSjN1V3lac0ZNVXk2MGVKbzlTcEZsZjNYT296R3Nmb2lHMFVpL0t4YXJDUjdoXG5YV0Nwb0tLYkVTajRTY2NjUFZqbEVvQk9mL29BZko3bVlSTCt4SU5uL2JXd1ozSEUycWFSRkRXWkFvR0FTMEU5XG5TOGppK1dmNDV4WlJBYWR2eThjQjQ1clQrUUJabm5mc0JwTVVtVTdHUm5paXFGRm9wUS9vZnFoRFM0dHRzQVNpXG5teXZIK0VDbGo5SzBzMU1ZY1FtYm0xMmV2RG9UdTJnVVRpSHlaN1pwUXpGMVhYNkwxU0lLMks3c3BhdGlHVWtHXG43R3htc2IvaW5aK3E2dEtEMG9JRGNpVzBhOS9uRXZpdXFYcTRtbUVDZ1lFQTJCSEYrMDRRREphWS9XVHNoc2dDXG5yY0laY2ErSkFCNzdZYzNEZks4T2gyTkdTUkJidGlST2kxVi9zalBoNENDTjB2a01TZjhoTXVmeFgwaVQ2ZHI5XG5LWWNBRU5MMGt4ZkU3Z0FWZkc5T2FDVVF4MmlEWDFQYWQ3MHkyNmthYWRJTkZ3T2dqOWJkdGIxdmZ5Zkk0d3cxXG5IaWtGaG1zdTN4UzNZQ1VKMk04blpMOD1cbi0tLS0tRU5EIFBSSVZBVEUgS0VZLS0tLS0=';

async function testConnection() {
  console.log('🔍 Testing Google Sheets connection with manual env vars...');
  console.log('SHEET_ID:', process.env.SHEET_ID ? 'SET' : 'MISSING');
  console.log('GOOGLE_CLIENT_EMAIL:', process.env.GOOGLE_CLIENT_EMAIL ? 'SET' : 'MISSING');
  console.log('GOOGLE_PRIVATE_KEY_B64:', process.env.GOOGLE_PRIVATE_KEY_B64 ? 'SET' : 'MISSING');

  try {
    console.log('🔑 Creating auth client...');
    const auth = new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      Buffer.from(process.env.GOOGLE_PRIVATE_KEY_B64, 'base64').toString('utf8').replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    console.log('📊 Creating Sheets client...');
    const sheets = google.sheets({ version: 'v4', auth });

    console.log('🔍 Getting sheet metadata...');
    const res = await sheets.spreadsheets.get({
      spreadsheetId: process.env.SHEET_ID,
    });

    console.log('\n✅ SUCCESS! Connected to Sheet.');
    console.log('Sheet title:', res.data.properties.title);
    console.log('Sheet ID:', res.data.spreadsheetId);
    console.log('Number of sheets:', res.data.sheets.length);
    
    // List available sheets
    if (res.data.sheets && res.data.sheets.length > 0) {
      console.log('\n📋 Available sheets:');
      res.data.sheets.forEach((sheet, index) => {
        console.log(`  ${index + 1}. ${sheet.properties.title}`);
      });
    }
  } catch (error) {
    console.log('❌ Error:', error.response?.data || error.message);
    console.log('Full error:', error);
  }
}

testConnection();
