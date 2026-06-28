import { getStoredAuthToken, normalizeStoredToken } from './authStorage';
import { isTokenExpired } from './token';

const ROLE_STORAGE_KEYS = {
  customer: 'auth_customer',
  seller: 'auth_seller',
  admin: 'auth_admin',
  delivery: 'auth_delivery',
};

const memoryTokens = {};

export function setRoleToken(role, token) {
  const storageKey = ROLE_STORAGE_KEYS[role];
  if (!storageKey) return;

  const normalized = normalizeStoredToken(token);
  if (normalized && !isTokenExpired(normalized)) {
    memoryTokens[role] = normalized;
    localStorage.setItem(storageKey, normalized);
    return;
  }

  delete memoryTokens[role];
  localStorage.removeItem(storageKey);
}

export function clearRoleToken(role) {
  const storageKey = ROLE_STORAGE_KEYS[role];
  delete memoryTokens[role];
  if (storageKey) {
    localStorage.removeItem(storageKey);
  }
}

export function getRoleToken(role) {
  const storageKey = ROLE_STORAGE_KEYS[role];
  if (!storageKey) return null;

  const cached = memoryTokens[role];
  if (cached && !isTokenExpired(cached)) {
    return cached;
  }

  const stored = getStoredAuthToken(storageKey);
  if (stored) {
    memoryTokens[role] = stored;
    return stored;
  }

  delete memoryTokens[role];
  return null;
}

export function syncRoleTokensFromStorage() {
  for (const role of Object.keys(ROLE_STORAGE_KEYS)) {
    const token = getStoredAuthToken(ROLE_STORAGE_KEYS[role]);
    if (token) {
      memoryTokens[role] = token;
    } else {
      delete memoryTokens[role];
    }
  }
}
