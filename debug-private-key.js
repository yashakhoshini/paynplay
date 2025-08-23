import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('🔍 Debugging Private Key Format');
console.log('===============================');

const privateKeyB64 = process.env.GOOGLE_PRIVATE_KEY_B64;

if (!privateKeyB64) {
  console.log('❌ GOOGLE_PRIVATE_KEY_B64 not found');
  process.exit(1);
}

console.log(`📊 Base64 length: ${privateKeyB64.length} characters`);

// Decode the private key
console.log('\n🔐 Decoding private key...');
let privateKey;
try {
  privateKey = Buffer.from(privateKeyB64, 'base64').toString('utf8');
  console.log('✅ Private key decoded successfully');
} catch (error) {
  console.log('❌ Failed to decode private key:', error.message);
  process.exit(1);
}

console.log(`📊 Decoded length: ${privateKey.length} characters`);

// Check the format
console.log('\n📝 Private key format check:');
const lines = privateKey.split('\n');
console.log(`Number of lines: ${lines.length}`);

if (lines.length > 0) {
  console.log(`First line: "${lines[0]}"`);
  console.log(`Last line: "${lines[lines.length - 1]}"`);
}

// Check if it has the correct PEM format
const hasBegin = lines[0].includes('-----BEGIN PRIVATE KEY-----');
const hasEnd = lines[lines.length - 1].includes('-----END PRIVATE KEY-----');

console.log(`\n🔍 PEM Format Check:`);
console.log(`Has BEGIN line: ${hasBegin}`);
console.log(`Has END line: ${hasEnd}`);

if (!hasBegin || !hasEnd) {
  console.log('\n⚠️  Private key doesn\'t have proper PEM format');
  console.log('Expected format:');
  console.log('-----BEGIN PRIVATE KEY-----');
  console.log('MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...');
  console.log('-----END PRIVATE KEY-----');
  
  // Try to fix it
  console.log('\n🔧 Attempting to fix private key format...');
  
  // Remove any extra characters and ensure proper format
  let fixedKey = privateKey.trim();
  
  // If it doesn't start with BEGIN, add it
  if (!fixedKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
    fixedKey = '-----BEGIN PRIVATE KEY-----\n' + fixedKey;
  }
  
  // If it doesn't end with END, add it
  if (!fixedKey.endsWith('-----END PRIVATE KEY-----')) {
    fixedKey = fixedKey + '\n-----END PRIVATE KEY-----';
  }
  
  console.log('✅ Fixed private key format');
  console.log(`Fixed key length: ${fixedKey.length} characters`);
  
  // Test the fixed key
  console.log('\n🧪 Testing fixed private key...');
  try {
    const { google } = await import('googleapis');
    
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: fixedKey,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    const authClient = await auth.getClient();
    console.log('✅ Fixed private key works!');
    
  } catch (error) {
    console.log('❌ Fixed private key still has issues:', error.message);
  }
} else {
  console.log('✅ Private key has correct PEM format');
}
