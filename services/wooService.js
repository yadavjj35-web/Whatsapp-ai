// path: services/wooService.js
/**
 * WooCommerce Service wrapper
 *
 * - Provides resilient API calls to WooCommerce REST API using axios
 * - Adds retry and circuit breaker protections
 *
 * Exports:
 *  - getOrder(orderId)
 *  - createOrder(order)
 *  - updateInventory(sku, qty)
 */

import axios from 'axios';
import retryWrapper from '../utils/retryWrapper.js';
import circuitBreakerUtil from '../utils/circuitBreaker.js';
import logger from '../utils/logger.js';

const WOO_API_BASE = process.env.WOO_API_BASE || '';
const WOO_KEY = process.env.WOO_KEY || '';
const WOO_SECRET = process.env.WOO_SECRET || '';

if (!WOO_API_BASE) logger.warn('WOO_API_BASE not configured; wooService will fail until set');

function buildClient() {
  return axios.create({
    baseURL: WOO_API_BASE,
    timeout: Number(process.env.WOO_TIMEOUT_MS || 8000),
    auth: WOO_KEY && WOO_SECRET ? { username: WOO_KEY, password: WOO_SECRET } : undefined
  });
}

/**
 * Generic call with retry and circuit breaker
 */
async function callWithResilience(fn, opts = {}) {
  const breaker = circuitBreakerUtil.createCircuitBreaker(fn, opts.circuit || {});
  try {
    return await breaker.fire();
  } catch (err) {
    // fallback to retry wrapper if breaker rejects
    logger.warn('Circuit breaker fired, attempting retry wrapper', { error: err.message });
    return retryWrapper(fn, { attempts: opts.attempts || 3, baseDelayMs: opts.baseDelayMs || 300 });
  }
}

export async function getOrder(orderId) {
  if (!orderId) throw new Error('orderId required');
  const fn = async () => {
    const client = buildClient();
    const resp = await client.get(`/orders/${encodeURIComponent(orderId)}`);
    return resp.data;
  };
  return callWithResilience(fn, { circuit: { timeout: 10000 } });
}

export async function createOrder(order) {
  if (!order) throw new Error('order required');
  const fn = async () => {
    const client = buildClient();
    const resp = await client.post(`/orders`, order);
    return resp.data;
  };
  return callWithResilience(fn, { circuit: { timeout: 15000 } });
}

export async function updateInventory(sku, quantity) {
  if (!sku) throw new Error('sku required');
  const fn = async () => {
    const client = buildClient();
    // WooCommerce inventory update varies; this example patches a product by SKU
    const resp = await client.get(`/products`, { params: { sku } });
    const prod = resp.data && resp.data[0];
    if (!prod) throw new Error('product not found');
    const updateResp = await client.put(`/products/${prod.id}`, { stock_quantity: quantity });
    return updateResp.data;
  };
  return callWithResilience(fn, { circuit: { timeout: 10000 } });
}

export default { getOrder, createOrder, updateInventory };
