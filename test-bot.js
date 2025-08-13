// Quick test to verify bot configuration
console.log('🔍 Testing bot configuration...');

// Check if we can import the config
try {
  const { BOT_TOKEN, CLIENT_NAME, BASE_URL } = await import('./dist/config.js');
  console.log('✅ Config imported successfully');
  console.log('CLIENT_NAME:', CLIENT_NAME);
  console.log('BASE_URL:', BASE_URL || 'NOT_SET');
  console.log('BOT_TOKEN:', BOT_TOKEN ? 'SET' : 'MISSING');
  
  if (!BOT_TOKEN) {
    console.log('❌ BOT_TOKEN is missing! Set it in Railway Variables.');
  } else {
    console.log('✅ BOT_TOKEN is set');
  }
} catch (error) {
  console.error('❌ Failed to import config:', error.message);
}

console.log('�� Test complete!');
