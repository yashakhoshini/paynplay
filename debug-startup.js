// Debug startup issues
console.log('🔍 Debugging bot startup...');

// Test 1: Check if we can import config
try {
  console.log('📋 Testing config import...');
  const { BOT_TOKEN, CLIENT_NAME, BASE_URL } = await import('./dist/config.js');
  console.log('✅ Config imported successfully');
  console.log('CLIENT_NAME:', CLIENT_NAME);
  console.log('BASE_URL:', BASE_URL || 'NOT_SET');
  console.log('BOT_TOKEN:', BOT_TOKEN ? 'SET' : 'MISSING');
  
  if (!BOT_TOKEN) {
    console.log('❌ BOT_TOKEN is missing! This will cause startup failure.');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Failed to import config:', error.message);
  process.exit(1);
}

// Test 2: Check if we can create a simple bot
try {
  console.log('🤖 Testing bot creation...');
  const { Bot } = await import('grammy');
  const bot = new Bot(process.env.BOT_TOKEN);
  console.log('✅ Bot created successfully');
  
  // Test 3: Check webhook info
  console.log('🌐 Checking webhook info...');
  const webhookInfo = await bot.api.getWebhookInfo();
  console.log('Webhook info:', JSON.stringify(webhookInfo, null, 2));
  
  if (webhookInfo.url) {
    console.log('⚠️  Webhook is set to:', webhookInfo.url);
    console.log('   This might be causing the issue if you\'re testing locally!');
  } else {
    console.log('✅ No webhook set - this is good for local testing');
  }
  
} catch (error) {
  console.error('❌ Bot creation failed:', error.message);
  process.exit(1);
}

console.log('🎉 All tests passed! The issue might be in the main bot logic.');
