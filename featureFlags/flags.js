// path: featureFlags/flags.js
/**
 * Simple Feature Flags manager
 *
 * - Supports:
 *   - Static flags from environment variables (FF_<KEY>=true)
 *   - JSON file override at config/feature-flags.json (optional)
 *   - Runtime overrides via in-memory control (setFlag/unsetFlag)
 *   - External provider adapter placeholder (LaunchDarkly/Unleash) via optional init(provider)
 *
 * Exports:
 *  - getFlag(key, { context }) -> boolean or variant
 *  - setFlag(key, value)
 *  - unsetFlag(key)
 *  - listFlags()
 *  - init(providerAdapter) -> optional external provider integration
 *
 * This is intentionally lightweight and safe for server-side usage.
 */

import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

const runtimeFlags = new Map();
let provider = null;
let fileFlags = {};

try {
  const flagsPath = path.resolve(process.cwd(), 'config', 'feature-flags.json');
  if (fs.existsSync(flagsPath)) {
    const raw = fs.readFileSync(flagsPath, 'utf8');
    fileFlags = JSON.parse(raw);
    logger.info('Loaded feature-flags.json', { path: flagsPath, count: Object.keys(fileFlags).length });
  }
} catch (err) {
  logger.warn('Failed to load config/feature-flags.json', { error: err.message });
}

/**
 * Build flag key to environment variable name: FF_<UPPERCASE_KEY>
 */
function envFlagKey(key) {
  return `FF_${String(key).replace(/[^A-Z0-9]/gi, '_').toUpperCase()}`;
}

/**
 * Evaluate a flag:
 * Priority:
 *  1. runtimeFlags map
 *  2. environment variable FF_<KEY>
 *  3. fileFlags (config/feature-flags.json)
 *  4. external provider (if configured)
 *  5. fallback default (false)
 */
export async function getFlag(key, { context = null } = {}) {
  // runtime overrides
  if (runtimeFlags.has(key)) return runtimeFlags.get(key);

  // env var
  const envKey = envFlagKey(key);
  if (Object.prototype.hasOwnProperty.call(process.env, envKey)) {
    const v = process.env[envKey];
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
    // allow JSON value for variants
    try {
      return JSON.parse(v);
    } catch (e) {
      return v;
    }
  }

  // file config
  if (Object.prototype.hasOwnProperty.call(fileFlags, key)) return fileFlags[key];

  // provider fallback
  if (provider && typeof provider.getFlag === 'function') {
    try {
      const pv = await provider.getFlag(key, context);
      if (pv !== undefined) return pv;
    } catch (err) {
      logger.warn('Feature provider failed to get flag', { key, error: err.message });
    }
  }

  return false;
}

export function setFlag(key, value) {
  runtimeFlags.set(key, value);
  return true;
}

export function unsetFlag(key) {
  return runtimeFlags.delete(key);
}

export function listFlags() {
  const out = {};
  // runtime
  for (const [k, v] of runtimeFlags.entries()) out[k] = v;
  // file
  for (const k of Object.keys(fileFlags)) if (!(k in out)) out[k] = fileFlags[k];
  // envs (only those starting with FF_)
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('FF_')) {
      const fk = k.slice(3).toLowerCase();
      if (!(fk in out)) out[fk] = process.env[k];
    }
  }
  return out;
}

/**
 * init provider adapter:
 * providerAdapter must implement getFlag(key, context)
 */
export function init(providerAdapter) {
  if (providerAdapter && typeof providerAdapter.getFlag === 'function') {
    provider = providerAdapter;
    logger.info('Feature flags provider initialized');
  } else {
    throw new Error('Invalid provider adapter');
  }
}

export default { getFlag, setFlag, unsetFlag, listFlags, init };
