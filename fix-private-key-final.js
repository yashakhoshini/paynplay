const fs = require('fs');
const path = require('path');

console.log('=== Fixing Private Key Format ===');

// Read the .env file
const envPath = path.join(__dirname, '.env');
let envContent = fs.readFileSync(envPath, 'utf8');

// Find the GOOGLE_PRIVATE_KEY line
const privateKeyMatch = envContent.match(/GOOGLE_PRIVATE_KEY="([^"]+)"/);

if (privateKeyMatch) {
    let privateKey = privateKeyMatch[1];
    
    console.log('Original private key length:', privateKey.length);
    console.log('First 50 chars:', privateKey.substring(0, 50));
    console.log('Last 50 chars:', privateKey.substring(privateKey.length - 50));
    
    // Replace \n with actual newlines
    privateKey = privateKey.replace(/\\n/g, '\n');
    
    // Ensure it has proper BEGIN/END markers
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        privateKey = '-----BEGIN PRIVATE KEY-----\n' + privateKey;
    }
    if (!privateKey.includes('-----END PRIVATE KEY-----')) {
        privateKey = privateKey + '\n-----END PRIVATE KEY-----';
    }
    
    console.log('\nFixed private key length:', privateKey.length);
    console.log('First 50 chars:', privateKey.substring(0, 50));
    console.log('Last 50 chars:', privateKey.substring(privateKey.length - 50));
    console.log('Contains BEGIN marker:', privateKey.includes('-----BEGIN PRIVATE KEY-----'));
    console.log('Contains END marker:', privateKey.includes('-----END PRIVATE KEY-----'));
    console.log('Contains actual newlines:', privateKey.includes('\n'));
    
    // Replace the line in the .env file
    const newEnvContent = envContent.replace(
        /GOOGLE_PRIVATE_KEY="[^"]+"/,
        `GOOGLE_PRIVATE_KEY="${privateKey.replace(/\n/g, '\\n')}"`
    );
    
    // Write back to .env file
    fs.writeFileSync(envPath, newEnvContent);
    console.log('\n✅ Private key format fixed in .env file');
} else {
    console.log('❌ Could not find GOOGLE_PRIVATE_KEY in .env file');
}
