// path: config/secretsManager.js
/**
 * Secrets Manager Adapter
 *
 * Behavior:
 *  - By default, returns secrets from process.env
 *  - If SECRETS_PROVIDER === 'aws', attempts to use AWS Secrets Manager by dynamic import
 *  - Caches fetched secrets in memory for TTL (configurable)
 *
 * Env:
 *  - SECRETS_PROVIDER (optional) = 'aws' to use AWS Secrets Manager
 *  - SECRETS_CACHE_TTL_MS (optional) default 600000 (10 minutes)
 *
 * Usage:
 *  const sm = await secretsManager.getSecret('my/secret/name');
 *
 * Notes:
 *  - This module will only import AWS SDK client if provider configured to 'aws' and the package is available.
 *  - For production, we recommend using a real secrets manager (AWS Secrets Manager, HashiCorp Vault).
 */

import logger from '../utils/logger.js';

const provider = process.env.SECRETS_PROVIDER || 'env';
const cacheTtl = Number(process.env.SECRETS_CACHE_TTL_MS || 10 * 60 * 1000);

const cache = new Map(); // name -> { value, expiresAt }

/**
 * Read secret from local env (process.env)
 */
async function getFromEnv(name) {
  // Promote dotted names to env var uppercase snake
  const envKey = name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  if (Object.prototype.hasOwnProperty.call(process.env, envKey)) {
    return process.env[envKey];
  }
  // also attempt direct name
  if (Object.prototype.hasOwnProperty.call(process.env, name)) {
    return process.env[name];
  }
  return null;
}

/**
 * AWS Secrets Manager fetcher (dynamically imported)
 */
async function getFromAws(name) {
  try {
    // dynamic import to avoid mandatory dependency unless used
    const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const cmd = new GetSecretValueCommand({ SecretId: name });
    const resp = await client.send(cmd);
    if (resp && resp.SecretString) {
      try {
        return JSON.parse(resp.SecretString);
      } catch (e) {
        return resp.SecretString;
      }
    }
    return null;
  } catch (err) {
    logger.error('Failed to fetch secret from AWS Secrets Manager', { error: err.message });
    throw err;
  }
}

/**
 * Public getSecret method
 */
export async function getSecret(name) {
  if (!name) throw new Error('Secret name is required');

  // check cache
  const cached = cache.get(name);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value = null;
  if (provider === 'aws') {
    value = await getFromAws(name);
  } else {
    value = await getFromEnv(name);
  }

  // cache the value
  cache.set(name, { value, expiresAt: Date.now() + cacheTtl });
  return value;
}

/**
 * Convenience: load multiple secrets into object
 * keys: { envKey: secretName, ... }
 */
export async function loadSecretsMap(map) {
  const out = {};
  for (const [k, secretName] of Object.entries(map || {})) {
    out[k] = await getSecret(secretName);
  }
  return out;
}

export default { getSecret, loadSecretsMap };
