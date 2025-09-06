import crypto from 'crypto';
import { CONFIG } from './config.js';

// In-memory pending store (resets on process restart)
const store = new Map<
  string,
  {
    token: string;
    userId: string | number;
    rail: string;          // normalized rail
    amount: number;        // dollars, validated
    reference?: string;    // optional
    createdAt: number;
  }
>();

const now = () => Date.now();

// Normalize a rail key to a stable form (e.g., "Apple Pay" -> "APPLE_PAY")
function normalizeRail(rail: string) {
  return String(rail ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function validateAmount(n: unknown) {
  const amount = Number(n);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false as const, err: 'Amount must be a positive number' };
  }
  if (amount < CONFIG.MIN_BUY_IN) {
    return { ok: false as const, err: `Minimum amount is $${CONFIG.MIN_BUY_IN}` };
  }
  if (amount > CONFIG.MAX_BUY_IN) {
    return { ok: false as const, err: `Maximum amount is $${CONFIG.MAX_BUY_IN}` };
  }
  return { ok: true as const, amount };
}

// Very light sanitation: trim, cap length, and remove newlines
function sanitizeReference(ref: string) {
  const trimmed = String(ref ?? '').trim().slice(0, 120);
  return trimmed.replace(/[\r\n]+/g, ' ').slice(0, 120);
}

function isExpired(createdAt: number) {
  return now() - createdAt > CONFIG.PENDING_TTL_MS;
}

/**
 * Create a pending external deposit token.
 * Throws if input invalid.
 */
export function createPendingExternal(userId: string | number, rail: string, amount: number) {
  if (userId === undefined || userId === null) {
    throw new Error('userId is required');
  }

  const normalizedRail = normalizeRail(rail);
  if (!normalizedRail) {
    throw new Error('rail is required');
  }

  const v = validateAmount(amount);
  if (!v.ok) throw new Error(v.err);

  // 12 bytes -> 96 bits entropy; base64url safe for callback data
  const token = crypto.randomBytes(12).toString('base64url');

  const pending = {
    token,
    userId,
    rail: normalizedRail,
    amount: v.amount,
    createdAt: now(),
  };
  store.set(token, pending);
  return pending;
}

export function setReference(token: string, reference: string) {
  const p = store.get(token);
  if (!p) return false;
  if (isExpired(p.createdAt)) {
    store.delete(token);
    return false;
  }
  p.reference = sanitizeReference(reference);
  return true;
}

export function getPending(token: string) {
  const p = store.get(token);
  if (!p) return undefined;
  if (isExpired(p.createdAt)) {
    store.delete(token);
    return undefined;
  }
  return p;
}

export function deletePending(token: string) {
  store.delete(token);
}

// Optional periodic cleanup
export function sweepExpired() {
  const t = now();
  for (const [k, v] of store.entries()) {
    if (t - v.createdAt > CONFIG.PENDING_TTL_MS) store.delete(k);
  }
}
