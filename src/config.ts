import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const BOT_TOKEN = required("BOT_TOKEN");
export const SHEET_ID = required("SHEET_ID");
export const GOOGLE_CLIENT_EMAIL = required("GOOGLE_CLIENT_EMAIL");
export const GOOGLE_PRIVATE_KEY = required("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
export const BASE_URL = process.env.BASE_URL || "";
export const PORT = parseInt(process.env.PORT || "3000", 10);
