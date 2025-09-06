import crypto from 'crypto';
import { CONFIG } from './config.js';

type PendingExternal = {
  token: string;
  userId: string;     // who initiated the flow
  rail: string;       // e.g., 'card' | 'stripe' | 'external'
  amount: number;     // preselected amount from the UI
  reference?: string; // payment id / notes
  createdAt: number;
};

const store = new Map<string, PendingExternal>();

function now() { return Date.now(); }

export function createPendingExternal(userId: string, rail: string, amount: number): PendingExternal {
  const token = crypto.randomBytes(6).toString('base64url'); // short, URL-safe
  const pending: PendingExternal = { token, userId, rail, amount, createdAt: now() };
  store.set(token, pending);
  return pending;
}

export function setReference(token: string, reference: string) {
  const p = store.get(token);
  if (!p) return;
  p.reference = reference;
}

export function getPending(token: string): PendingExternal | undefined {
  const p = store.get(token);
  if (!p) return;
  if (now() - p.createdAt > CONFIG.PENDING_TTL_MS) {
    store.delete(token);
    return;
  }
  return p;
}

export function deletePending(token: string) {
  store.delete(token);
}

// Optional cleanup (in case you want to sweep periodically)
export function sweepExpired() {
  const t = now();
  for (const [k, v] of store.entries()) {
    if (t - v.createdAt > CONFIG.PENDING_TTL_MS) store.delete(k);
  }
}
