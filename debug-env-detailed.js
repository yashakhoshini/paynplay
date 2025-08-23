import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Detailed ENV File Analysis');
console.log('==============================');

const envPath = path.join(__dirname, '.env');

try {
  // Read as buffer to see raw bytes
  const buffer = fs.readFileSync(envPath);
  console.log(`📊 File size: ${buffer.length} bytes`);
  
  // Check first 20 bytes
  console.log('\n🔢 First 20 bytes (hex):');
  const firstBytes = buffer.slice(0, 20);
  console.log(Array.from(firstBytes).map(b => b.toString(16).padStart(2, '0')).join(' '));
  
  // Check for BOM
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    console.log('⚠️  UTF-8 BOM detected');
  } else if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    console.log('⚠️  UTF-16 LE BOM detected');
  } else if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
    console.log('⚠️  UTF-16 BE BOM detected');
  } else {
    console.log('✅ No BOM detected');
  }
  
  // Read as string and analyze
  const content = buffer.toString('utf8');
  const lines = content.split('\n');
  
  console.log(`\n📝 Total lines: ${lines.length}`);
  
  // Find first few actual variable lines
  console.log('\n🔍 First 10 variable lines:');
  let varCount = 0;
  for (let i = 0; i < lines.length && varCount < 10; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      varCount++;
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=');
      
      console.log(`  ${i + 1}: ${key}=${value.substring(0, 30)}${value.length > 30 ? '...' : ''}`);
      
      // Check for special characters in key
      const keyBytes = Buffer.from(key, 'utf8');
      if (keyBytes.length !== key.length) {
        console.log(`    ⚠️  Key has special characters: ${Array.from(keyBytes).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
      }
    }
  }
  
  // Try to find BOT_TOKEN specifically
  console.log('\n🎯 Looking for BOT_TOKEN specifically:');
  let foundBotToken = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('BOT_TOKEN=')) {
      foundBotToken = true;
      console.log(`  Found at line ${i + 1}: ${line.substring(0, 50)}...`);
      
      // Check the exact format
      const match = line.match(/BOT_TOKEN\s*=\s*(.+)/);
      if (match) {
        const value = match[1].trim();
        console.log(`  Value: ${value.substring(0, 20)}...`);
        console.log(`  Value length: ${value.length}`);
        console.log(`  Value bytes: ${Buffer.from(value, 'utf8').length}`);
      }
      break;
    }
  }
  
  if (!foundBotToken) {
    console.log('  ❌ BOT_TOKEN not found in file');
  }
  
  // Try manual parsing with detailed logging
  console.log('\n🔄 Manual parsing test:');
  const dotenv = await import('dotenv');
  
  // Clear any existing env vars
  delete process.env.BOT_TOKEN;
  delete process.env.SHEET_ID;
  
  // Try loading
  const result = dotenv.config({ path: envPath, debug: true });
  console.log('Dotenv result:', result);
  
  // Check what was actually loaded
  console.log('\n📋 Environment variables after dotenv:');
  const envVars = Object.keys(process.env).filter(key => 
    key.includes('BOT') || key.includes('SHEET') || key.includes('GOOGLE') || key.includes('CLIENT')
  );
  
  if (envVars.length > 0) {
    envVars.forEach(key => {
      const value = process.env[key];
      console.log(`  ${key}: ${key.includes('TOKEN') ? '***' + value.slice(-4) : value}`);
    });
  } else {
    console.log('  No relevant environment variables found');
  }
  
} catch (error) {
  console.log(`❌ Error analyzing .env file: ${error.message}`);
}
