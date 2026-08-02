// path: integrations/zohoClient.js
/**
 * Zoho CRM Client (production-ready)
 *
 * - Supports OAuth access token in ZOHO_ACCESS_TOKEN env var (recommended) or API key.
 * - Exposes helpers:
 *   - getContactByEmail(email)
 *   - upsertContact(contact)
 *   - createDeal(deal)
 *
 * Env:
 *  - ZOHO_ACCESS_TOKEN
 *  - ZOHO_API_BASE (optional)
 *  - ZOHO_ORG_ID (optional - used in headers)
 *
 * Uses retryWrapper for transient errors.
 */

import axios from 'axios';
import retryWrapper from '../utils/retryWrapper.js';
import logger from '../utils/logger.js';

const API_BASE = process.env.ZOHO_API_BASE || 'https://www.zohoapis.com/crm/v2';
const ACCESS_TOKEN = process.env.ZOHO_ACCESS_TOKEN || '';
const ORG_ID = process.env.ZOHO_ORG_ID || '';

const axiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: Number(process.env.ZOHO_CLIENT_TIMEOUT_MS || 8000),
  headers: ACCESS_TOKEN ? { Authorization: `Zoho-oauthtoken ${ACCESS_TOKEN}`, 'X-com-zoho-subscriptions-organizationid': ORG_ID } : {}
});

/**
 * Get contact by email; Zoho CRM supports search endpoint.
 */
export async function getContactByEmail(email) {
  if (!email) throw new Error('email required');
  const fn = async () => {
    const resp = await axiosInstance.get(`/Contacts/search`, { params: { email } });
    const records = resp.data?.data || [];
    return records[0] || null;
  };
  return retryWrapper(fn, { attempts: 3, baseDelayMs: 300 });
}

/**
 * Upsert contact: if exists update, else create.
 * contact: { Email, First_Name, Last_Name, Phone, Other fields... }
 */
export async function upsertContact(contact = {}) {
  if (!contact || !contact.Email) throw new Error('contact.Email required');
  const existing = await getContactByEmail(contact.Email);
  if (existing && existing.id) {
    const fn = async () => {
      const resp = await axiosInstance.put(`/Contacts`, { data: [{ id: existing.id, ...contact }] });
      return resp.data;
    };
    return retryWrapper(fn, { attempts: 3, baseDelayMs: 300 });
  } else {
    const fn = async () => {
      const resp = await axiosInstance.post(`/Contacts`, { data: [contact] });
      return resp.data;
    };
    return retryWrapper(fn, { attempts: 3, baseDelayMs: 300 });
  }
}

/**
 * Create a deal (Zoho "Deals")
 * deal: Zoho formatted object in properties
 */
export async function createDeal(deal = {}) {
  if (!deal) throw new Error('deal required');
  const fn = async () => {
    const resp = await axiosInstance.post(`/Deals`, { data: [deal] });
    return resp.data;
  };
  return retryWrapper(fn, { attempts: 3, baseDelayMs: 300 });
}

export default { getContactByEmail, upsertContact, createDeal };
