// path: controllers/wooController.js
import wooService from '../services/wooService.js';
import logger from '../utils/logger.js';

/**
 * API endpoints to proxy WooCommerce operations securely.
 * All endpoints should be protected via API-key or JWT (middleware will be wired in routes).
 */

export async function searchProducts(req, res, next) {
  const { q, perPage, page, category } = req.query;
  if (!q) return res.status(400).json({ success: false, error: 'Missing query parameter q' });
  try {
    const products = await wooService.searchProducts(q, { perPage: perPage ? parseInt(perPage, 10) : 10, page: page ? parseInt(page, 10) : 1, category });
    return res.json({ success: true, data: products });
  } catch (err) {
    logger.error('searchProducts controller error', err);
    return next(err);
  }
}

export async function getProduct(req, res, next) {
  const id = req.params.id;
  if (!id) return res.status(400).json({ success: false, error: 'Missing product id' });
  try {
    const product = await wooService.getProductById(id);
    return res.json({ success: true, data: product });
  } catch (err) {
    logger.error('getProduct controller error', err);
    return next(err);
  }
}

export async function featuredProducts(req, res, next) {
  try {
    const products = await wooService.getFeatured(6);
    return res.json({ success: true, data: products });
  } catch (err) {
    logger.error('featuredProducts controller error', err);
    return next(err);
  }
}

export async function bestSellers(req, res, next) {
  try {
    const products = await wooService.getBestSellers(6);
    return res.json({ success: true, data: products });
  } catch (err) {
    logger.error('bestSellers controller error', err);
    return next(err);
  }
}
