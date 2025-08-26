import 'dotenv/config';
import { google } from 'googleapis';
const raw = Buffer.from(process.env.GOOGLE_PRIVATE_KEY_B64 ?? '', 'base64')
    .toString('utf8')
    .trim();
const privateKey = raw
    .replace(/\\r\\n/g, '\n') // if double-escaped
    .replace(/\\n/g, '\n') // turn literal \n into real newlines
    .replace(/\r\n/g, '\n'); // normalize CRLF
if (!privateKey.startsWith('-----BEGIN PRIVATE KEY-----') ||
    !privateKey.endsWith('-----END PRIVATE KEY-----')) {
    throw new Error('Decoded key still malformed after newline normalization.');
}
const auth = new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: privateKey },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
export async function getClient() {
    return auth.getClient();
}
