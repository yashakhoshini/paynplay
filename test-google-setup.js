import 'dotenv/config';
import { getClient } from './src/googleClient.js';

async function main() {
  try {
    console.log('Testing Google client setup...');
    const client = await getClient();
    console.log('✅ Google client OK'); // Do not log secrets.
  } catch (err) {
    console.error('❌ Startup error:', err?.message || err);
    process.exit(1);
  }
}

main();
