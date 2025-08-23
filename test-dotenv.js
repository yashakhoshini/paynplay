import dotenv from 'dotenv';

console.log('=== Testing dotenv auto-load ===');
dotenv.config();

console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('SHEET_ID:', process.env.SHEET_ID);
console.log('GOOGLE_CLIENT_EMAIL:', process.env.GOOGLE_CLIENT_EMAIL);
console.log('GOOGLE_PRIVATE_KEY_B64 length:', process.env.GOOGLE_PRIVATE_KEY_B64 ? process.env.GOOGLE_PRIVATE_KEY_B64.length : 'MISSING');
