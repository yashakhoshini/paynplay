import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 Fixing UTF-16 ENV File');
console.log('==========================');

const envPath = path.join(__dirname, '.env');
const backupPath = path.join(__dirname, '.env.backup');

try {
  // Create backup
  console.log('📦 Creating backup...');
  fs.copyFileSync(envPath, backupPath);
  console.log('✅ Backup created: .env.backup');

  // Read the file as buffer
  console.log('📖 Reading .env file...');
  const buffer = fs.readFileSync(envPath);
  console.log(`📊 File size: ${buffer.length} bytes`);
  
  // Check for UTF-16 LE BOM (ff fe)
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    console.log('🔧 UTF-16 LE BOM detected - converting to UTF-8...');
    
    // Convert UTF-16 LE to UTF-8
    const utf16Content = buffer.toString('utf16le');
    console.log('✅ Converted from UTF-16 LE to UTF-8');
    
    // Write back as UTF-8
    fs.writeFileSync(envPath, utf16Content, 'utf8');
    console.log('✅ Saved as UTF-8');
    
  } else {
    console.log('✅ No UTF-16 BOM detected, file is already UTF-8');
  }

  // Test the fix
  console.log('\n🧪 Testing the fix...');
  const dotenv = await import('dotenv');
  dotenv.config({ path: envPath, override: true });

  // Check key variables
  const testVars = ['BOT_TOKEN', 'SHEET_ID', 'GOOGLE_CLIENT_EMAIL', 'CLIENT_NAME'];
  let successCount = 0;

  testVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      console.log(`✅ ${varName}: ${varName.includes('TOKEN') ? '***' + value.slice(-4) : value}`);
      successCount++;
    } else {
      console.log(`❌ ${varName}: NOT SET`);
    }
  });

  if (successCount === testVars.length) {
    console.log('\n🎉 SUCCESS! All environment variables are now loaded correctly.');
  } else {
    console.log('\n⚠️  Some variables are still not loading. Let\'s try manual loading...');
    
    // Try manual loading as fallback
    console.log('\n🔄 Trying manual loading...');
    const fileContent = fs.readFileSync(envPath, 'utf8');
    const envLines = fileContent.split('\n');
    
    for (const line of envLines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=');
        if (key && value !== undefined) {
          process.env[key.trim()] = value.trim();
        }
      }
    }
    
    // Check again
    console.log('\n🔍 Checking after manual load...');
    testVars.forEach(varName => {
      const value = process.env[varName];
      if (value) {
        console.log(`✅ ${varName}: ${varName.includes('TOKEN') ? '***' + value.slice(-4) : value}`);
      } else {
        console.log(`❌ ${varName}: STILL NOT SET`);
      }
    });
  }

} catch (error) {
  console.log(`❌ Error fixing .env file: ${error.message}`);
  
  // Restore backup if available
  if (fs.existsSync(backupPath)) {
    console.log('🔄 Restoring backup...');
    fs.copyFileSync(backupPath, envPath);
    console.log('✅ Backup restored');
  }
}
