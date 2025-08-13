import { getRolesFromSheet } from './sheets.js';
import {
  OWNER_IDS,
  LOADER_IDS
} from './config.js';

export type Role = 'owner' | 'loader' | 'none';

interface UserRole {
  tg_user_id: number;
  role: Role;
  display_name?: string;
}

// Cache for roles loaded from sheet
let rolesCache: UserRole[] | null = null;
let rolesCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadRoles(): Promise<UserRole[]> {
  const now = Date.now();
  
  // Return cached roles if still valid
  if (rolesCache && (now - rolesCacheTime) < CACHE_TTL) {
    return rolesCache;
  }

  const roles: UserRole[] = [];

  // Load from environment variables
  const ownerIds = OWNER_IDS.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
  const loaderIds = LOADER_IDS.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

  // Add owners from env
  for (const id of ownerIds) {
    roles.push({ tg_user_id: id, role: 'owner' });
  }

  // Add loaders from env (but don't override owners)
  for (const id of loaderIds) {
    if (!roles.find(r => r.tg_user_id === id)) {
      roles.push({ tg_user_id: id, role: 'loader' });
    }
  }

  // Try to load from Roles sheet and merge
  try {
    const sheetRoles = await getRolesFromSheet();
    for (const sheetRole of sheetRoles) {
      const existingIndex = roles.findIndex(r => r.tg_user_id === sheetRole.tg_user_id);
      if (existingIndex >= 0) {
        // Update existing role (sheet takes precedence)
        roles[existingIndex] = sheetRole;
      } else {
        // Add new role from sheet
        roles.push(sheetRole);
      }
    }
  } catch (error) {
    console.log('Could not load roles from sheet:', error);
  }

  // Cache the results
  rolesCache = roles;
  rolesCacheTime = now;

  return roles;
}

export async function isOwner(tgId: number): Promise<boolean> {
  const roles = await loadRoles();
  return roles.some(r => r.tg_user_id === tgId && r.role === 'owner');
}

export async function isLoader(tgId: number): Promise<boolean> {
  const roles = await loadRoles();
  return roles.some(r => r.tg_user_id === tgId && (r.role === 'loader' || r.role === 'owner'));
}

export async function isPrivileged(tgId: number): Promise<boolean> {
  const roles = await loadRoles();
  return roles.some(r => r.tg_user_id === tgId && (r.role === 'owner' || r.role === 'loader'));
}

export async function getRole(tgId: number): Promise<Role> {
  const roles = await loadRoles();
  const userRole = roles.find(r => r.tg_user_id === tgId);
  return userRole?.role || 'none';
}

export async function getDisplayName(tgId: number): Promise<string | undefined> {
  const roles = await loadRoles();
  const userRole = roles.find(r => r.tg_user_id === tgId);
  return userRole?.display_name;
}

// Clear cache (useful for testing or when roles change)
export function clearRolesCache(): void {
  rolesCache = null;
  rolesCacheTime = 0;
}
