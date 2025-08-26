// resolveSheetId.cjs
// Usage: node resolveSheetId.cjs

const { google } = require('googleapis');
const dotenv = require('dotenv');

dotenv.config();

function decodePrivateKey() {
  console.log('🔍 Decoding private key...');
  const decoded = Buffer.from(process.env.GOOGLE_PRIVATE_KEY_B64, 'base64')
    .toString('utf8')
    .replace(/\\n/g, '\n');
  console.log('✅ Private key decoded');
  return decoded;
}

async function main() {
  console.log('🔍 Starting sheet ID resolution...');
  console.log('SHEET_ID:', process.env.SHEET_ID ? 'SET' : 'MISSING');
  console.log('GOOGLE_CLIENT_EMAIL:', process.env.GOOGLE_CLIENT_EMAIL ? 'SET' : 'MISSING');
  console.log('GOOGLE_PRIVATE_KEY_B64:', process.env.GOOGLE_PRIVATE_KEY_B64 ? 'SET' : 'MISSING');

  if (!process.env.SHEET_ID || !process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY_B64) {
    console.log('❌ Missing required environment variables');
    return;
  }

  try {
    console.log('🔑 Creating auth client...');
    const auth = new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      decodePrivateKey(),
      ['https://www.googleapis.com/auth/drive']
    );

    console.log('📁 Creating Drive client...');
    const drive = google.drive({ version: 'v3', auth });

    console.log('🔍 Getting file metadata...');
    const file = await drive.files.get({
      fileId: process.env.SHEET_ID,
      fields: 'id,name,mimeType,shortcutDetails',
      supportsAllDrives: true,
    });

    console.log('\n=== File Metadata ===');
    console.log(file.data);

    if (file.data.mimeType === 'application/vnd.google-apps.shortcut') {
      console.log('\n👉 This is a shortcut. Use this targetId as SHEET_ID:');
      console.log(file.data.shortcutDetails.targetId);
    } else if (file.data.mimeType !== 'application/vnd.google-apps.spreadsheet') {
      console.log('\n👉 This is NOT a Google Sheet. Convert it manually in Drive:');
      console.log('Open file → File → Save as Google Sheets → copy new ID');
    } else {
      console.log('\n✅ Already a proper Google Sheet! You don\'t need to change SHEET_ID.');
    }
  } catch (error) {
    console.log('❌ Error:', error.response?.data || error.message);
    console.log('Full error:', error);
  }
}

main().catch(err => {
  console.error('❌ Error:', err.response?.data || err.message);
});
