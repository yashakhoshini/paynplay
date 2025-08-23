// Fix Private Key Format Script
import fs from 'fs';

console.log('=== Fixing Private Key Format ===\n');

// Read the current .env file
const envPath = '.env';
let envContent = '';

try {
  envContent = fs.readFileSync(envPath, 'utf8');
  console.log('✅ Successfully read .env file');
} catch (error) {
  console.log('❌ Could not read .env file');
  process.exit(1);
}

// Find the GOOGLE_PRIVATE_KEY line
const privateKeyMatch = envContent.match(/GOOGLE_PRIVATE_KEY="([^"]+)"/);

if (!privateKeyMatch) {
  console.log('❌ Could not find GOOGLE_PRIVATE_KEY in .env file');
  process.exit(1);
}

const currentPrivateKey = privateKeyMatch[1];
console.log('Current private key format detected');

// Check if the key needs fixing
if (currentPrivateKey.includes('\\n')) {
  console.log('🔧 Fixing private key format...');
  
  // Replace \n with actual newlines
  const fixedPrivateKey = currentPrivateKey.replace(/\\n/g, '\n');
  
  // Update the .env file
  const updatedContent = envContent.replace(
    /GOOGLE_PRIVATE_KEY="([^"]+)"/,
    `GOOGLE_PRIVATE_KEY="${fixedPrivateKey}"`
  );
  
  try {
    fs.writeFileSync(envPath, updatedContent, 'utf8');
    console.log('✅ Successfully updated .env file with fixed private key');
    console.log('The private key now has proper newline formatting');
  } catch (error) {
    console.log('❌ Could not write to .env file');
    console.log('Please manually fix the private key format');
  }
} else {
  console.log('✅ Private key format looks correct');
}

console.log('\nNext steps:');
console.log('1. Run: node check-env-configuration.js');
console.log('2. If Google Sheets access works, proceed with bot testing');
console.log('3. Update BOT_TOKEN, OWNER_TG_USERNAME, and LOADER_GROUP_ID');
