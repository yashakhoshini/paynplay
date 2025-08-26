// debug-private-key.cjs
// Debug private key decoding

require('dotenv').config();

console.log('🔍 Debugging Private Key Decoding');
console.log('==================================');

const privateKeyB64 = process.env.GOOGLE_PRIVATE_KEY_B64;

if (!privateKeyB64) {
  console.log('❌ GOOGLE_PRIVATE_KEY_B64 is not set');
  process.exit(1);
}

console.log('✅ GOOGLE_PRIVATE_KEY_B64 is set');
console.log('📏 Length:', privateKeyB64.length);
console.log('🔢 First 50 chars:', privateKeyB64.substring(0, 50));
console.log('🔢 Last 50 chars:', privateKeyB64.substring(privateKeyB64.length - 50));

try {
  console.log('\n🔍 Attempting to decode...');
  const decoded = Buffer.from(privateKeyB64, 'base64').toString('utf8');
  
  console.log('✅ Base64 decode successful');
  console.log('📏 Decoded length:', decoded.length);
  console.log('📝 First 100 chars:', decoded.substring(0, 100));
  console.log('📝 Last 100 chars:', decoded.substring(decoded.length - 100));
  
  // Check for BEGIN/END markers
  const hasBegin = decoded.includes('-----BEGIN PRIVATE KEY-----');
  const hasEnd = decoded.includes('-----END PRIVATE KEY-----');
  
  console.log('\n🔍 Checking format:');
  console.log('✅ Has BEGIN marker:', hasBegin);
  console.log('✅ Has END marker:', hasEnd);
  
  if (hasBegin && hasEnd) {
    console.log('✅ Private key format looks correct');
  } else {
    console.log('❌ Private key format is incorrect');
    console.log('Expected: -----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----');
  }
  
} catch (error) {
  console.log('❌ Base64 decode failed:', error.message);
}
