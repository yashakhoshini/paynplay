import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config(); // so it loads your .env

async function run() {
  console.log('🔍 Starting file check...');
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
      Buffer.from(process.env.GOOGLE_PRIVATE_KEY_B64, 'base64').toString(),
      ['https://www.googleapis.com/auth/drive']
    );

    console.log('📁 Creating Drive client...');
    const drive = google.drive({ version: 'v3', auth });

    console.log('🔍 Getting file metadata...');
    const file = await drive.files.get({
      fileId: process.env.SHEET_ID,
      fields: 'id,name,mimeType,shortcutDetails',
    });

    console.log('✅ File metadata:');
    console.log(file.data);
  } catch (error) {
    console.log('❌ Error:', error.message);
    console.log('Full error:', error);
  }
}

run().catch(console.error);