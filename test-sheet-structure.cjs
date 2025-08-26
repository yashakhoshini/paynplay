// test-sheet-structure.cjs
// Test Google Sheet structure and compatibility with withdrawal/deposit logic

const { google } = require('googleapis');
require('dotenv').config();

async function testSheetStructure() {
  console.log('🔍 Testing Google Sheet structure and compatibility...');
  
  try {
    // Create auth client
    const auth = new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      Buffer.from(process.env.GOOGLE_PRIVATE_KEY_B64, 'base64').toString('utf8').replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    const sheets = google.sheets({ version: 'v4', auth });

    // Test each sheet structure
    const sheetNames = ['Withdrawals', 'Deposits', 'Settings', 'OwnerPayouts'];
    
    for (const sheetName of sheetNames) {
      console.log(`\n📋 Testing ${sheetName} sheet...`);
      
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: process.env.SHEET_ID,
          range: `${sheetName}!A1:Z10`, // Get first 10 rows
        });

        const rows = response.data.values || [];
        
        if (rows.length === 0) {
          console.log(`  ⚠️  ${sheetName} sheet is empty`);
          continue;
        }

        const headers = rows[0] || [];
        console.log(`  📊 Headers: ${headers.join(', ')}`);
        console.log(`  📈 Rows: ${rows.length - 1} data rows`);

        // Check specific sheet compatibility
        if (sheetName === 'Withdrawals') {
          checkWithdrawalsCompatibility(headers, rows);
        } else if (sheetName === 'Deposits') {
          checkDepositsCompatibility(headers, rows);
        } else if (sheetName === 'Settings') {
          checkSettingsCompatibility(headers, rows);
        } else if (sheetName === 'OwnerPayouts') {
          checkOwnerPayoutsCompatibility(headers, rows);
        }

      } catch (error) {
        console.log(`  ❌ Error reading ${sheetName}: ${error.message}`);
      }
    }

  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

function checkWithdrawalsCompatibility(headers, rows) {
  console.log('  🔍 Checking Withdrawals compatibility...');
  
  const expectedHeaders = [
    'request_id', 'user_id', 'username', 'amount_usd', 'method', 
    'payment_tag_or_address', 'request_timestamp_iso', 'approved_by_user_id', 
    'approved_at_iso', 'status', 'payout_type', 'notes'
  ];

  const missingHeaders = expectedHeaders.filter(h => 
    !headers.some(header => header.toLowerCase().includes(h.toLowerCase()))
  );

  if (missingHeaders.length > 0) {
    console.log(`  ⚠️  Missing headers: ${missingHeaders.join(', ')}`);
  } else {
    console.log('  ✅ All expected headers found');
  }

  // Check for sample data
  if (rows.length > 1) {
    console.log('  📝 Sample data row:', rows[1]);
  }
}

function checkDepositsCompatibility(headers, rows) {
  console.log('  🔍 Checking Deposits compatibility...');
  
  const expectedHeaders = [
    'payment_method', 'amount', 'status', 'user_id', 'username', 'timestamp'
  ];

  const missingHeaders = expectedHeaders.filter(h => 
    !headers.some(header => header.toLowerCase().includes(h.toLowerCase()))
  );

  if (missingHeaders.length > 0) {
    console.log(`  ⚠️  Missing headers: ${missingHeaders.join(', ')}`);
  } else {
    console.log('  ✅ All expected headers found');
  }

  // Check for sample data
  if (rows.length > 1) {
    console.log('  📝 Sample data row:', rows[1]);
  }
}

function checkSettingsCompatibility(headers, rows) {
  console.log('  🔍 Checking Settings compatibility...');
  
  const expectedHeaders = ['key', 'value'];

  const missingHeaders = expectedHeaders.filter(h => 
    !headers.some(header => header.toLowerCase().includes(h.toLowerCase()))
  );

  if (missingHeaders.length > 0) {
    console.log(`  ⚠️  Missing headers: ${missingHeaders.join(', ')}`);
  } else {
    console.log('  ✅ All expected headers found');
  }

  // Check for key settings
  const settings = {};
  for (let i = 1; i < rows.length; i++) {
    const [key, value] = rows[i] || [];
    if (key && value) {
      settings[key.toLowerCase()] = value;
    }
  }

  console.log('  ⚙️  Current settings:', Object.keys(settings));
}

function checkOwnerPayoutsCompatibility(headers, rows) {
  console.log('  🔍 Checking OwnerPayouts compatibility...');
  
  const expectedHeaders = [
    'request_id', 'user_id', 'username', 'amount_usd', 'method', 
    'payment_tag_or_address', 'request_timestamp_iso', 'status', 'notes'
  ];

  const missingHeaders = expectedHeaders.filter(h => 
    !headers.some(header => header.toLowerCase().includes(h.toLowerCase()))
  );

  if (missingHeaders.length > 0) {
    console.log(`  ⚠️  Missing headers: ${missingHeaders.join(', ')}`);
  } else {
    console.log('  ✅ All expected headers found');
  }

  // Check for sample data
  if (rows.length > 1) {
    console.log('  📝 Sample data row:', rows[1]);
  }
}

testSheetStructure();
