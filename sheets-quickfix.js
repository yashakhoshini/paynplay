import 'dotenv/config';
import { google } from 'googleapis';

const privateKey = Buffer.from(process.env.GOOGLE_PRIVATE_KEY_B64 ?? '', 'base64').toString('utf8').trim();

if (!privateKey.includes('BEGIN PRIVATE KEY') || !privateKey.includes('END PRIVATE KEY')) {
  throw new Error('Decoded key malformed — regenerate and re-encode the PEM.');
}

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: privateKey,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

export async function getClient() {
  return auth.getClient();
}
