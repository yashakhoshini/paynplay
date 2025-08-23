// Check Private Key Format
import fs from 'fs';

console.log('=== Checking Private Key Format ===\n');

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
console.log('Current private key length:', currentPrivateKey.length);
console.log('First 50 characters:', currentPrivateKey.substring(0, 50));
console.log('Last 50 characters:', currentPrivateKey.substring(currentPrivateKey.length - 50));

// Check for common issues
console.log('\nPrivate Key Analysis:');
console.log('Has BEGIN marker:', currentPrivateKey.includes('-----BEGIN PRIVATE KEY-----'));
console.log('Has END marker:', currentPrivateKey.includes('-----END PRIVATE KEY-----'));
console.log('Has \\n sequences:', currentPrivateKey.includes('\\n'));
console.log('Has actual newlines:', currentPrivateKey.includes('\n'));

// Show the key structure
console.log('\nCurrent key structure:');
const lines = currentPrivateKey.split('\\n');
console.log('Number of \\n-separated parts:', lines.length);
lines.forEach((line, index) => {
  console.log(`Part ${index + 1}: ${line.substring(0, 20)}...`);
});

console.log('\nRecommendation:');
if (currentPrivateKey.includes('-----BEGIN PRIVATE KEY-----') && 
    currentPrivateKey.includes('-----END PRIVATE KEY-----') &&
    currentPrivateKey.includes('\\n')) {
  console.log('✅ Key format looks correct but needs newline conversion');
  console.log('Run: node fix-private-key-format.js');
} else if (currentPrivateKey.includes('MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQ')) {
  console.log('✅ Key content detected but missing headers/footers');
  console.log('Run: node fix-private-key-format.js');
} else {
  console.log('❌ Key format is incorrect');
  console.log('You may need to regenerate the service account key');
}
