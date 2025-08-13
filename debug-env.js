// Debug script to check environment variables
console.log('🔍 Environment Variables Debug');
console.log('================================');

const criticalVars = [
  'BOT_TOKEN',
  'BASE_URL', 
  'CLIENT_NAME',
  'CLIENT_ID',
  'PORT',
  'LOADER_GROUP_ID',
  'ALLOWED_USER_IDS'
];

console.log('\n📋 Critical Variables:');
criticalVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    // Mask sensitive values
    if (varName === 'BOT_TOKEN') {
      const parts = value.split(':');
      if (parts.length === 2) {
        console.log(`✅ ${varName}: ${parts[0]}:***${parts[1].slice(-4)}`);
      } else {
        console.log(`⚠️  ${varName}: ${value} (invalid format)`);
      }
    } else {
      console.log(`✅ ${varName}: ${value}`);
    }
  } else {
    console.log(`❌ ${varName}: NOT SET`);
  }
});

console.log('\n🔧 Other Variables:');
const otherVars = [
  'SHEET_ID',
  'GOOGLE_CLIENT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
  'METHODS_ENABLED_DEFAULT',
  'CURRENCY_DEFAULT',
  'MAX_BUYIN_AMOUNT',
  'MIN_BUYIN_AMOUNT'
];

otherVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    if (varName === 'GOOGLE_PRIVATE_KEY') {
      console.log(`✅ ${varName}: ***${value.slice(-10)}`);
    } else {
      console.log(`✅ ${varName}: ${value}`);
    }
  } else {
    console.log(`⚠️  ${varName}: NOT SET`);
  }
});

console.log('\n🚀 Next Steps:');
console.log('1. If BOT_TOKEN is missing, you need to set it in Railway dashboard');
console.log('2. If BASE_URL is missing, the bot will use long polling instead of webhooks');
console.log('3. Check Railway logs for any startup errors');
console.log('4. Visit your health endpoint: https://your-app.up.railway.app/health');
