const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '.env');
const raw = fs.readFileSync(envPath, 'utf8')
  // remove BOM and any zero-width stuff at start
  .replace(/^\uFEFF/, '')
  .replace(/^\u200B+/, '')
  // also strip any accidental backticks at the start
  .replace(/^`+/, '');

const parsed = dotenv.parse(raw); // parse safely
Object.assign(process.env, parsed); // put into process.env

console.log('DEBUG env (after safe load):', {
  SHEET_ID: process.env.SHEET_ID,
  GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
  GOOGLE_PRIVATE_KEY_B64: process.env.GOOGLE_PRIVATE_KEY_B64 ? 'SET' : 'MISSING',
});
