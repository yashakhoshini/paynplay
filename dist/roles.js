// src/roles.ts
export function parseIds(envVal) {
    return (envVal || "")
        .split(",")
        .map(s => Number(s.trim()))
        .filter(n => Number.isFinite(n));
}
const OWNER_SET = new Set(parseIds(process.env.OWNER_IDS));
const LOADER_SET = new Set(parseIds(process.env.LOADER_IDS));
export function getRole(tgId) {
    if (OWNER_SET.has(tgId))
        return "owner";
    if (LOADER_SET.has(tgId))
        return "loader";
    return "none";
}
export const isOwner = (id) => OWNER_SET.has(id);
export const isLoader = (id) => LOADER_SET.has(id);
export const isPrivileged = (id) => OWNER_SET.has(id) || LOADER_SET.has(id);
