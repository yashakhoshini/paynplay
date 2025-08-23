import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 ENV File Connection Test & Fix');
console.log('==================================');

// Test 1: Check if .env file exists and is readable
console.log('\n📁 Test 1: File Existence & Readability');
const envPath = path.join(__dirname, '.env');
console.log(`Looking for .env at: ${envPath}`);

if (fs.existsSync(envPath)) {
  console.log('✅ .env file exists');
  
  try {
    const stats = fs.statSync(envPath);
    console.log(`📊 File size: ${stats.size} bytes`);
    console.log(`📅 Last modified: ${stats.mtime}`);
    
    // Read first few lines to check format
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n').slice(0, 5);
    console.log('\n📝 First 5 lines of .env:');
    lines.forEach((line, i) => {
      if (line.trim()) {
        console.log(`  ${i + 1}: ${line.substring(0, 50)}${line.length > 50 ? '...' : ''}`);
      }
    });
  } catch (error) {
    console.log(`❌ Error reading .env: ${error.message}`);
  }
} else {
  console.log('❌ .env file not found');
}

// Test 2: Try different dotenv loading methods
console.log('\n🔄 Test 2: Dotenv Loading Methods');

// Method 1: Default dotenv
try {
  const dotenv = await import('dotenv');
  dotenv.config();
  console.log('✅ Method 1: Default dotenv.config() - SUCCESS');
} catch (error) {
  console.log(`❌ Method 1: Default dotenv.config() - FAILED: ${error.message}`);
}

// Method 2: Explicit path
try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: envPath });
  console.log('✅ Method 2: Explicit path dotenv.config() - SUCCESS');
} catch (error) {
  console.log(`❌ Method 2: Explicit path dotenv.config() - FAILED: ${error.message}`);
}

// Method 3: Force reload
try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: envPath, override: true });
  console.log('✅ Method 3: Force reload dotenv.config() - SUCCESS');
} catch (error) {
  console.log(`❌ Method 3: Force reload dotenv.config() - FAILED: ${error.message}`);
}

// Test 3: Check environment variables
console.log('\n🔍 Test 3: Environment Variables Check');

const testVars = [
  'BOT_TOKEN',
  'SHEET_ID', 
  'GOOGLE_CLIENT_EMAIL',
  'GOOGLE_PRIVATE_KEY_B64',
  'CLIENT_NAME',
  'CLIENT_ID'
];

testVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    if (varName.includes('TOKEN') || varName.includes('KEY')) {
      console.log(`✅ ${varName}: ***${value.slice(-4)}`);
    } else {
      console.log(`✅ ${varName}: ${value}`);
    }
  } else {
    console.log(`❌ ${varName}: NOT SET`);
  }
});

// Test 4: Manual file parsing
console.log('\n📖 Test 4: Manual File Parsing');
try {
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split('\n');
  let parsedCount = 0;
  
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=');
      if (key && value !== undefined) {
        parsedCount++;
        console.log(`  📝 Found: ${key}=${value.substring(0, 20)}${value.length > 20 ? '...' : ''}`);
      }
    }
  });
  
  console.log(`✅ Manually parsed ${parsedCount} environment variables`);
} catch (error) {
  console.log(`❌ Manual parsing failed: ${error.message}`);
}

// Test 5: Fix attempt
console.log('\n🔧 Test 5: Fix Attempt');
try {
  // Load dotenv with explicit path and debug
  const dotenv = await import('dotenv');
  dotenv.config({ 
    path: envPath, 
    debug: true,
    override: true 
  });
  
  console.log('✅ Applied fix: dotenv.config({ path, debug: true, override: true })');
  
  // Check again
  const botToken = process.env.BOT_TOKEN;
  const sheetId = process.env.SHEET_ID;
  
  if (botToken) {
    console.log(`✅ BOT_TOKEN now loaded: ***${botToken.slice(-4)}`);
  } else {
    console.log('❌ BOT_TOKEN still not loaded');
  }
  
  if (sheetId) {
    console.log(`✅ SHEET_ID now loaded: ${sheetId}`);
  } else {
    console.log('❌ SHEET_ID still not loaded');
  }
  
} catch (error) {
  console.log(`❌ Fix attempt failed: ${error.message}`);
}

console.log('\n🎯 Summary:');
console.log('If variables are still not loading, the issue might be:');
console.log('1. File encoding (should be UTF-8)');
console.log('2. Line endings (should be LF or CRLF)');
console.log('3. Variable format (should be KEY=value)');
console.log('4. Hidden characters in the file');
console.log('5. File permissions');
