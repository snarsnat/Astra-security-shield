import { nanoid } from 'nanoid';
import crypto from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/**
 * APIKeyService — hardened.
 *
 * Changes over v1:
 *   • Keys are stored with a peppered HMAC-SHA256 hash, not bare SHA-256.
 *     The pepper is loaded from ASTRA_KEY_PEPPER env, or generated once and
 *     persisted to ~/.astra/pepper with 0600 perms. Re-hashes legacy bare
 *     SHA-256 entries on first validation.
 *   • Keys file is written atomically (tmpfile + rename) with 0600 perms —
 *     previously it could land as 0644, readable by other local users.
 *   • Optional expiry (`expiresAt`). Expired keys are rejected at validate-
 *     time and surface in listings so operators can see them.
 *   • Validation uses constant-time compare against the stored hash.
 *   • Per-app key cap is enforced AFTER pruning expired/revoked entries.
 */

const ASTRA_DIR = join(homedir(), '.astra');
const KEYS_FILE = join(ASTRA_DIR, 'api-keys.json');
const PEPPER_FILE = join(ASTRA_DIR, 'pepper');
const HASH_VERSION = 2; // v1 = bare sha256 (legacy), v2 = HMAC-SHA256 with pepper

function ensureDir() {
  if (!existsSync(ASTRA_DIR)) mkdirSync(ASTRA_DIR, { recursive: true, mode: 0o700 });
}

function loadOrCreatePepper() {
  if (process.env.ASTRA_KEY_PEPPER) return process.env.ASTRA_KEY_PEPPER;
  try {
    ensureDir();
    if (existsSync(PEPPER_FILE)) {
      return readFileSync(PEPPER_FILE, 'utf-8').trim();
    }
    const fresh = crypto.randomBytes(32).toString('hex');
    writeFileSync(PEPPER_FILE, fresh, { mode: 0o600 });
    try { chmodSync(PEPPER_FILE, 0o600); } catch { /* best-effort on non-POSIX */ }
    return fresh;
  } catch (e) {
    // Fall back to an ephemeral pepper — all keys become invalid on restart
    // rather than being insecurely hashed. Log loudly.
    console.error('[APIKeyService] Could not persist pepper; falling back to ephemeral:', e.message);
    return crypto.randomBytes(32).toString('hex');
  }
}

const PEPPER = loadOrCreatePepper();

function hashKey(rawKey) {
  return crypto.createHmac('sha256', PEPPER).update(rawKey).digest('hex');
}

// Legacy hash for on-the-fly migration of v1 entries
function legacyHashKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function timingSafeHexEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

function atomicWrite(path, data) {
  ensureDir();
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, data, { mode: 0o600 });
  try { chmodSync(tmp, 0o600); } catch {}
  renameSync(tmp, path);
  try { chmodSync(path, 0o600); } catch {}
}

class APIKeyService {
  constructor() {
    this.keys = new Map();    // keyHash -> keyData
    this.appKeys = new Map(); // appName -> [keyHash]
    this._loadFromDisk();
  }

  _loadFromDisk() {
    try {
      if (!existsSync(KEYS_FILE)) return;
      const raw = readFileSync(KEYS_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (!Array.isArray(data.keys)) return;

      for (const keyData of data.keys) {
        keyData.rateUsage = [];
        // Legacy entries have no hashVersion — treat as v1 (bare sha256).
        if (!keyData.hashVersion) keyData.hashVersion = 1;
        this.keys.set(keyData.hash, keyData);

        if (!this.appKeys.has(keyData.appName)) {
          this.appKeys.set(keyData.appName, []);
        }
        this.appKeys.get(keyData.appName).push(keyData.hash);
      }
    } catch (e) {
      console.error('[APIKeyService] Failed to load keys from disk:', e.message);
    }
  }

  _saveToDisk() {
    try {
      const serializable = Array.from(this.keys.values()).map(k => {
        const { rateUsage, ...rest } = k;
        return rest;
      });
      atomicWrite(KEYS_FILE, JSON.stringify({ keys: serializable, savedAt: Date.now() }, null, 2));
    } catch (e) {
      console.error('[APIKeyService] Failed to save keys to disk:', e.message);
    }
  }

  generateKey({
    appName,
    description = '',
    permissions = ['verify', 'challenge', 'analyze'],
    rateLimit = 60,
    expiresInDays = null,
  }) {
    if (!appName || typeof appName !== 'string' || !appName.trim()) {
      throw new Error('appName is required');
    }
    appName = appName.trim();

    if (!Array.isArray(permissions) || permissions.length === 0) {
      throw new Error('permissions must be a non-empty array');
    }
    const allowedPerms = new Set(['verify', 'challenge', 'analyze', 'admin']);
    for (const p of permissions) {
      if (!allowedPerms.has(p)) throw new Error(`unknown permission: ${p}`);
    }

    if (!Number.isFinite(rateLimit) || rateLimit < 1 || rateLimit > 100000) {
      throw new Error('rateLimit must be an integer in [1, 100000]');
    }

    // Prune stale entries, then enforce the per-app cap
    const existingHashes = this.appKeys.get(appName) || [];
    const now = Date.now();
    const activeCount = existingHashes.filter(h => {
      const k = this.keys.get(h);
      if (!k || k.revoked) return false;
      if (k.expiresAt && k.expiresAt < now) return false;
      return true;
    }).length;
    if (activeCount >= 10) {
      throw new Error('Maximum 10 active keys per app. Revoke some keys first.');
    }

    const randomPart = nanoid(32);
    const safeName = appName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const fullKey = `astra_${safeName}_${randomPart}`;
    const keyHash = hashKey(fullKey);

    const expiresAt = Number.isFinite(expiresInDays) && expiresInDays > 0
      ? now + expiresInDays * 24 * 60 * 60 * 1000
      : null;

    const keyData = {
      id: `key_${nanoid(8)}`,
      hash: keyHash,
      hashVersion: HASH_VERSION,
      appName,
      description: String(description).trim().slice(0, 500),
      permissions,
      rateLimit,
      rateUsage: [],
      created: new Date().toISOString(),
      expiresAt,
      revoked: false,
      revokedAt: null,
      totalRequests: 0,
      lastUsed: null,
    };

    this.keys.set(keyHash, keyData);
    if (!this.appKeys.has(appName)) this.appKeys.set(appName, []);
    this.appKeys.get(appName).push(keyHash);

    this._saveToDisk();

    return {
      key: fullKey,
      metadata: {
        id: keyData.id,
        appName: keyData.appName,
        description: keyData.description,
        permissions: keyData.permissions,
        rateLimit: keyData.rateLimit,
        created: keyData.created,
        expiresAt: keyData.expiresAt,
      },
    };
  }

  validateKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return { valid: false, error: 'API key is required' };
    }

    const v2Hash = hashKey(apiKey);
    let keyData = this.keys.get(v2Hash);
    let matchedViaLegacy = false;

    // Legacy fallback: try bare SHA-256 hash for v1-stored entries
    if (!keyData) {
      const v1Hash = legacyHashKey(apiKey);
      const legacyCandidate = this.keys.get(v1Hash);
      if (legacyCandidate && legacyCandidate.hashVersion === 1) {
        keyData = legacyCandidate;
        matchedViaLegacy = true;
      }
    }

    if (!keyData) return { valid: false, error: 'Invalid API key' };

    // Defence-in-depth: constant-time compare against the stored hash to avoid
    // leaking hash-prefix info via Map lookup shortcuts.
    const expectedHash = keyData.hash;
    const computed = matchedViaLegacy ? legacyHashKey(apiKey) : hashKey(apiKey);
    if (!timingSafeHexEqual(computed, expectedHash)) {
      return { valid: false, error: 'Invalid API key' };
    }

    if (keyData.revoked) return { valid: false, error: 'API key has been revoked' };

    const now = Date.now();
    if (keyData.expiresAt && keyData.expiresAt < now) {
      return { valid: false, error: 'API key has expired' };
    }

    // Per-key rate limit (sliding 60s window)
    const windowMs = 60_000;
    keyData.rateUsage = keyData.rateUsage.filter(t => now - t < windowMs);
    if (keyData.rateUsage.length >= keyData.rateLimit) {
      return { valid: false, error: `Rate limit exceeded (${keyData.rateLimit}/min). Retry later.` };
    }

    keyData.rateUsage.push(now);
    keyData.totalRequests++;
    keyData.lastUsed = new Date().toISOString();

    // Silently upgrade legacy v1 entries to v2 on first successful validation.
    if (keyData.hashVersion === 1) {
      const newHash = hashKey(apiKey);
      this.keys.delete(keyData.hash);
      keyData.hash = newHash;
      keyData.hashVersion = HASH_VERSION;
      this.keys.set(newHash, keyData);

      // Update appKeys index
      const idx = this.appKeys.get(keyData.appName) || [];
      const pos = idx.indexOf(legacyHashKey(apiKey));
      if (pos !== -1) idx[pos] = newHash;

      this._saveToDisk();
    } else if (keyData.totalRequests % 50 === 0) {
      this._saveToDisk();
    }

    return { valid: true, keyData };
  }

  revokeKey(keyHash) {
    const keyData = this.keys.get(keyHash);
    if (!keyData) return false;
    keyData.revoked = true;
    keyData.revokedAt = new Date().toISOString();
    this._saveToDisk();
    return true;
  }

  revokeKeyById(keyId) {
    for (const [hash, keyData] of this.keys) {
      if (keyData.id === keyId) return this.revokeKey(hash);
    }
    return false;
  }

  listKeys(appName) {
    const hashes = this.appKeys.get(appName) || [];
    return hashes
      .map(h => this.keys.get(h))
      .filter(Boolean)
      .map(({ id, appName, description, permissions, rateLimit, created, expiresAt,
              revoked, revokedAt, totalRequests, lastUsed }) =>
        ({ id, appName, description, permissions, rateLimit, created, expiresAt,
           revoked, revokedAt, totalRequests, lastUsed,
           expired: !!(expiresAt && expiresAt < Date.now()) })
      );
  }

  listApps() {
    return Array.from(this.appKeys.keys()).map(appName => {
      const keys = this.listKeys(appName);
      return {
        appName,
        totalKeys: keys.length,
        activeKeys: keys.filter(k => !k.revoked && !k.expired).length,
      };
    });
  }

  getKeyStats(keyHash) {
    const k = this.keys.get(keyHash);
    if (!k) return null;
    return {
      id: k.id,
      appName: k.appName,
      created: k.created,
      expiresAt: k.expiresAt,
      totalRequests: k.totalRequests,
      lastUsed: k.lastUsed,
      revoked: k.revoked,
      rateLimit: k.rateLimit,
      currentRate: k.rateUsage.length,
    };
  }
}

export default new APIKeyService();
