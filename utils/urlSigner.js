// path: utils/urlSigner.js
/**
 * URL signer for time-limited approval links.
 *
 * Uses HMAC-SHA256 with a secret to sign a JSON payload and produce a compact token.
 * Token format: base64url(JSON(payload)) . '.' . base64url(sig)
 *
 * Exports:
 *  - sign(payload, { expiresInSeconds }) -> { id, token, url } // url built if BASE_URL and APPROVAL_PATH env set
 *  - verify(token) -> payload or throws
 *
 * Environment:
 *  - URL_SIGNING_SECRET (required)
 *  - APPROVAL_BASE_URL (optional) e.g., https://app.example.com
 *  - APPROVAL_ACCEPT_PATH (optional) e.g., /api/v1/approvals/accept
 *
 * Security:
 *  - Uses constant-time compare for signature verification
 */

import crypto from 'crypto';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const SECRET = process.env.URL_SIGNING_SECRET || process.env.SECRET_KEY || '';
const BASE_URL = process.env.APPROVAL_BASE_URL || process.env.APP_URL || '';
const ACCEPT_PATH = process.env.APPROVAL_ACCEPT_PATH || '/api/v1/approvals/accept';

if (!SECRET) {
  logger.warn('URL signing secret (URL_SIGNING_SECRET) not set. Signed links will not be secure.');
}

function base64UrlEncode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  // pad if necessary
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64');
}

/**
 * Sign a payload object, returns token and url
 */
export function sign(payload = {}, { expiresInSeconds = 24 * 3600 } = {}) {
  if (!SECRET) throw new Error('URL signing secret not configured');
  const id = payload.approvalId || `sig_${Date.now()}_${uuidv4()}`;
  const exp = Math.floor(Date.now() / 1000) + Number(expiresInSeconds || 3600);
  const full = { ...payload, id, exp };
  const json = JSON.stringify(full);
  const data = Buffer.from(json, 'utf8');
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest();
  const token = `${base64UrlEncode(data)}.${base64UrlEncode(sig)}`;
  const url = BASE_URL ? `${BASE_URL.replace(/\/$/, '')}${ACCEPT_PATH}?token=${encodeURIComponent(token)}` : `?token=${encodeURIComponent(token)}`;
  return { id, token, url, payload: full };
}

/**
 * Verify token and return payload (throws error if invalid/expired)
 */
export function verify(token) {
  if (!SECRET) throw new Error('URL signing secret not configured');
  if (!token || typeof token !== 'string') throw new Error('Invalid token');
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Malformed token');
  const dataB64 = parts[0];
  const sigB64 = parts[1];

  const dataBuf = base64UrlDecode(dataB64);
  const sigBuf = base64UrlDecode(sigB64);

  // compute expected sig
  const expected = crypto.createHmac('sha256', SECRET).update(dataBuf).digest();

  // constant-time comparison
  if (!crypto.timingSafeEqual(expected, sigBuf)) {
    throw new Error('Invalid token signature');
  }

  const json = dataBuf.toString('utf8');
  let payload;
  try {
    payload = JSON.parse(json);
  } catch (err) {
    throw new Error('Invalid token payload');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error('Token expired');
  }
  return payload;
}

export default { sign, verify };
