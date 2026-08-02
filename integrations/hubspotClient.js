// path: integrations/hubspotClient.js
/**
 * HubSpot Client (production-ready)
 *
 * - Uses HubSpot REST API with API Key or OAuth access token (prefers token)
 * - Exposes common helpers:
 *   - getContactByEmail(email)
 *   - upsertContact(contact) -> returns hubspot contact
 *   - createDeal(deal)
 *
 * Env:
 *  - HUBSPOT_API_KEY (fallback)
 *  - HUBSPOT_ACCESS_TOKEN (preferred)
 *  - HUBSPOT_API_BASE (optional)
 *
 * Retries on transient errors via retryWrapper.
 */

import axios from 'axios';
import retryWrapper from '../utils/retryWrapper.js';
import logger from '../utils/logger.js';

const API_BASE = process.env.HUBSPOT_API_BASE || 'https://api.hubapi.com';
const ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN || '';
const API_KEY = process.env.HUBSPOT_API_KEY || '';

const axiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: Number(process.env.HUBSPOT_CLIENT_TIMEOUT_MS || 8000),
  headers: ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}
});

/**
 * Build URL with apiKey fallback if no access token set.
 */
function buildUrl(path) {
  if (ACCESS_TOKEN) return path;
  if (API_KEY) {
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}hapikey=${encodeURIComponent(API_KEY)}`;
  }
  return path;
}

/**
 * Get contact by email
 */
export async function getContactByEmail(email) {
  if (!email) throw new Error('email required');
  const fn = async () => {
    const url = buildUrl(`/crm/v3/objects/contacts/search`);
    // use search endpoint
    const resp = await axiosInstance.post(url, {
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
      properties: ['email', 'firstname', 'lastname', 'phone'],
      limit: 1
    });
    const results = resp.data?.results || [];
    return results[0] || null;
  };
  return retryWrapper(fn, { attempts: 3, baseDelayMs: 300 });
}

/**
 * Upsert contact (email is primary)
 * contact: { email, firstname, lastname, phone, properties: {...} }
 */
export async function upsertContact(contact = {}) {
  if (!contact || !contact.email) throw new Error('contact.email required');
  const existing = await getContactByEmail(contact.email);
  const body = {
    properties: {
      email: contact.email,
      firstname: contact.firstname || '',
      lastname: contact.lastname || '',
      phone: contact.phone || '',
      ...(contact.properties || {})
    }
  };
  if (existing && existing.id) {
    // update
    const fn = async () => {
      const path = buildUrl(`/crm/v3/objects/contacts/${encodeURIComponent(existing.id)}`);
      const resp = await axiosInstance.patch(path, body);
      return resp.data;
    };
    return retryWrapper(fn, { attempts: 3, baseDelayMs: 300 });
  } else {
    // create
    const fn = async () => {
      const path = buildUrl(`/crm/v3/objects/contacts`);
      const resp = await axiosInstance.post(path, body);
      return resp.data;
    };
    return retryWrapper(fn, { attempts: 3, baseDelayMs: 300 });
  }
}

/**
 * Create a deal
 * deal: { properties: { dealname, amount, pipeline, stage, ... } }
 */
export async function createDeal(deal = {}) {
  if (!deal || !deal.properties) throw new Error('deal.properties required');
  const fn = async () => {
    const path = buildUrl(`/crm/v3/objects/deals`);
    const resp = await axiosInstance.post(path, deal);
    return resp.data;
  };
  return retryWrapper(fn, { attempts: 3, baseDelayMs: 300 });
}

export default {
  getContactByEmail,
  upsertContact,
  createDeal
};
