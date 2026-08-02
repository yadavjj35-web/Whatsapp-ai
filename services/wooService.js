// path: services/wooService.js
import axios from 'axios';
import qs from 'qs';
import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Simple WooCommerce wrapper using consumer key/secret query params for basic auth.
 * For production, prefer HTTPS + OAuth or server-to-server credentials.
 */

function baseClient() {
  const baseUrl = config.wooCommerce.baseUrl;
  if (!baseUrl || !config.wooCommerce.consumerKey || !config.wooCommerce.consumerSecret) {
    throw new Error('WooCommerce credentials not configured');
  }

  const client = axios.create({
    baseURL: `${baseUrl}/wp-json/wc/v3`,
    timeout: 15000
  });

  client.interceptors.request.use((req) => {
    // Append auth to query
    req.params = req.params || {};
    req.params.consumer_key = config.wooCommerce.consumerKey;
    req.params.consumer_secret = config.wooCommerce.consumerSecret;
    // Use qs to properly serialize arrays if needed
    req.paramsSerializer = (p) => qs.stringify(p, { arrayFormat: 'repeat' });
    return req;
  });

  return client;
}

async function searchProducts(query, { perPage = 10, page = 1, category = null } = {}) {
  const client = baseClient();
  const params = { search: query, per_page: perPage, page };
  if (category) params.category = category;

  try {
    const resp = await client.get('/products', { params });
    return resp.data;
  } catch (err) {
    logger.error('Woo searchProducts error', { message: err.message });
    throw err;
  }
}

async function getProductById(id) {
  const client = baseClient();
  try {
    const resp = await client.get(`/products/${id}`);
    return resp.data;
  } catch (err) {
    logger.error('Woo getProductById error', { id, message: err.message });
    throw err;
  }
}

async function getFeatured(perPage = 6) {
  const client = baseClient();
  try {
    const resp = await client.get('/products', { params: { featured: true, per_page: perPage } });
    return resp.data;
  } catch (err) {
    logger.error('Woo getFeatured error', { message: err.message });
    throw err;
  }
}

async function getBestSellers(perPage = 6) {
  const client = baseClient();
  try {
    const resp = await client.get('/products', { params: { orderby: 'popularity', per_page: perPage } });
    return resp.data;
  } catch (err) {
    logger.error('Woo getBestSellers error', { message: err.message });
    throw err;
  }
}

async function createOrder(orderData) {
  const client = baseClient();
  try {
    const resp = await client.post('/orders', orderData);
    return resp.data;
  } catch (err) {
    logger.error('Woo createOrder error', { message: err.message, orderData });
    throw err;
  }
}

async function getOrder(orderId) {
  const client = baseClient();
  try {
    const resp = await client.get(`/orders/${orderId}`);
    return resp.data;
  } catch (err) {
    logger.error('Woo getOrder error', { orderId, message: err.message });
    throw err;
  }
}

export default {
  searchProducts,
  getProductById,
  getFeatured,
  getBestSellers,
  createOrder,
  getOrder
};
