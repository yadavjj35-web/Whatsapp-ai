// path: auth/oidcClient.js
/**
 * OIDC Client & JWT verification utility
 *
 * Features:
 *  - Discover JWKS from OIDC_ISSUER or use JWKS_URI env var
 *  - Cache JWKS and convert JWK -> PEM using Node's crypto.createPublicKey
 *  - verifyToken(token) -> returns decoded payload if valid (RS256 signatures)
 *
 * Environment variables:
 *  - OIDC_ISSUER (e.g., https://accounts.example.com)
 *  - OIDC_JWKS_URI (optional; otherwise uses discovery at /.well-known/openid-configuration)
 *
 * Notes:
 *  - Uses 'jsonwebtoken' (already present) for verification.
 *  - Uses built-in Node 'crypto' to convert JWK to PEM (Node 20+ supports JWK import).
 */

import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import logger from '../utils/logger.js';

const OIDC_ISSUER = process.env.OIDC_ISSUER || '';
const OIDC_JWKS_URI = process.env.OIDC_JWKS_URI || '';

let jwksCache = { keys: [], fetchedAt: 0 };
const JWKS_TTL_MS = Number(process.env.OIDC_JWKS_TTL_MS || 12 * 60 * 60 * 1000); // 12 hours

async function fetchJwks() {
  // Use explicit JWKS_URI if provided; else use discovery
  let url = OIDC_JWKS_URI;
  if (!url && OIDC_ISSUER) {
    const discUrl = `${OIDC_ISSUER.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const resp = await fetch(discUrl, { timeout: 5000 });
    if (!resp.ok) throw new Error(`OIDC discovery failed: ${resp.status}`);
    const cfg = await resp.json();
    url = cfg.jwks_uri;
  }
  if (!url) throw new Error('No JWKS URI configured (set OIDC_JWKS_URI or OIDC_ISSUER)');

  const resp = await fetch(url, { timeout: 5000 });
  if (!resp.ok) throw new Error(`Failed to fetch JWKS: ${resp.status}`);
  const jwks = await resp.json();
  if (!jwks.keys || !Array.isArray(jwks.keys)) throw new Error('Invalid JWKS');
  jwksCache = { keys: jwks.keys, fetchedAt: Date.now() };
  logger.info('Fetched JWKS', { keys: jwks.keys.length });
  return jwksCache.keys;
}

/**
 * Get cached JWKS, refresh if TTL expired.
 */
async function getJwks() {
  if (!jwksCache.keys || jwksCache.keys.length === 0 || Date.now() - jwksCache.fetchedAt > JWKS_TTL_MS) {
    try {
      await fetchJwks();
    } catch (err) {
      logger.error('Failed to refresh JWKS', { error: err.message });
      // If cache present, still return it
      if (jwksCache.keys && jwksCache.keys.length) return jwksCache.keys;
      throw err;
    }
  }
  return jwksCache.keys;
}

/**
 * Convert a JWK (RSA) to PEM string using Node's crypto.createPublicKey
 */
function jwkToPem(jwk) {
  try {
    // Node's crypto supports importing JWK directly
    const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const pem = keyObject.export({ type: 'spki', format: 'pem' });
    return pem;
  } catch (err) {
    logger.error('Failed to convert JWK to PEM', { error: err.message });
    throw err;
  }
}

/**
 * Verify a JWT and return decoded payload
 */
export async function verifyToken(token, options = {}) {
  if (!token) throw new Error('Token is required');
  // Decode header to get kid and alg
  let decodedHeader;
  try {
    decodedHeader = jwt.decode(token, { complete: true }).header;
  } catch (err) {
    throw new Error('Invalid token format');
  }
  const kid = decodedHeader.kid;
  const alg = decodedHeader.alg || 'RS256';
  if (!kid) throw new Error('Token missing kid header');

  const jwks = await getJwks();
  const jwk = jwks.find((k) => k.kid === kid);
  if (!jwk) throw new Error(`Unable to find JWK for kid=${kid}`);

  // Convert JWK to PEM and verify
  const pem = jwkToPem(jwk);

  try {
    const verifyOpts = {
      algorithms: [alg],
      issuer: OIDC_ISSUER || undefined,
      // audience can be validated by caller via options
      audience: options.audience || undefined
    };
    const payload = jwt.verify(token, pem, verifyOpts);
    return payload;
  } catch (err) {
    logger.warn('JWT verification failed', { message: err.message });
    throw err;
  }
}

/**
 * Middleware to verify bearer token and populate req.user
 * Usage: router.use(authMiddleware);
 */
export function authMiddleware(options = {}) {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Missing bearer token' });
      }
      const token = authHeader.slice(7).trim();
      const payload = await verifyToken(token, options);
      // Attach to req.user
      req.user = payload;
      return next();
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Unauthorized', details: err.message });
    }
  };
}

export default { getJwks, fetchJwks, verifyToken, authMiddleware };
