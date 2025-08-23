// Fix Private Key Format - Comprehensive Solution
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
console.log('Current private key detected');

// Check if the key has the correct format
if (currentPrivateKey.includes('-----BEGIN PRIVATE KEY-----') && 
    currentPrivateKey.includes('-----END PRIVATE KEY-----')) {
  
  console.log('✅ Private key has correct BEGIN/END markers');
  
  // Check if it has proper newlines
  if (currentPrivateKey.includes('\\n')) {
    console.log('🔧 Fixing newline format...');
    
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
} else {
  console.log('❌ Private key format is incorrect');
  console.log('The key should have:');
  console.log('-----BEGIN PRIVATE KEY-----');
  console.log('(key content)');
  console.log('-----END PRIVATE KEY-----');
  
  // Try to fix common issues
  if (currentPrivateKey.includes('MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQ')) {
    console.log('🔧 Attempting to fix private key format...');
    
    // Add proper headers and footers
    const fixedPrivateKey = `-----BEGIN PRIVATE KEY-----\n${currentPrivateKey}\n-----END PRIVATE KEY-----`;
    
    // Update the .env file
    const updatedContent = envContent.replace(
      /GOOGLE_PRIVATE_KEY="([^"]+)"/,
      `GOOGLE_PRIVATE_KEY="${fixedPrivateKey}"`
    );
    
    try {
      fs.writeFileSync(envPath, updatedContent, 'utf8');
      console.log('✅ Successfully updated .env file with proper private key format');
    } catch (error) {
      console.log('❌ Could not write to .env file');
    }
  }
}

console.log('\nNext steps:');
console.log('1. Run: node test-sheets-access-simple.js');
console.log('2. If successful, run: node test-withdrawal-logic.js');
console.log('3. If still failing, you may need to regenerate the service account key');

console.log('\nIf the issue persists:');
console.log('1. Go to Google Cloud Console > IAM & Admin > Service Accounts');
console.log('2. Click on your service account');
console.log('3. Go to Keys tab');
console.log('4. Delete the existing key');
console.log('5. Create a new key (JSON format)');
console.log('6. Download and update the .env file with the new key');
