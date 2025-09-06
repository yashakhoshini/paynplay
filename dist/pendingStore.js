import crypto from 'crypto';
import { CONFIG } from './config.js';
const store = new Map();
function now() { return Date.now(); }
export function createPendingExternal(userId, rail, amount) {
    const token = crypto.randomBytes(6).toString('base64url'); // short, URL-safe
    const pending = { token, userId, rail, amount, createdAt: now() };
    store.set(token, pending);
    return pending;
}
export function setReference(token, reference) {
    const p = store.get(token);
    if (!p)
        return;
    p.reference = reference;
}
export function getPending(token) {
    const p = store.get(token);
    if (!p)
        return;
    if (now() - p.createdAt > CONFIG.PENDING_TTL_MS) {
        store.delete(token);
        return;
    }
    return p;
}
export function deletePending(token) {
    store.delete(token);
}
// Optional cleanup (in case you want to sweep periodically)
export function sweepExpired() {
    const t = now();
    for (const [k, v] of store.entries()) {
        if (t - v.createdAt > CONFIG.PENDING_TTL_MS)
            store.delete(k);
    }
}
