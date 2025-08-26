import { google } from 'googleapis';
import { GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY_PEM } from './config.js';
const auth = new google.auth.GoogleAuth({
    credentials: { client_email: GOOGLE_CLIENT_EMAIL, private_key: GOOGLE_PRIVATE_KEY_PEM },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
export async function getClient() {
    return auth.getClient();
}
