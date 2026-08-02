// path: services/recommendationEngine.js
import wooService from './wooService.js';
import logger from '../utils/logger.js';

/**
 * Recommendation engine that uses simple rules plus WooCommerce live data.
 * Accepts criteria and returns recommended products (live).
 *
 * criteria: { keywords, budgetRange, category, excludeInStockOnly: boolean, limit }
 */

async function recommend(criteria = {}) {
  const { keywords = '', budgetRange, category, limit = 3 } = criteria;
  try {
    // Basic search
    const products = await wooService.searchProducts(keywords, { perPage: 20, page: 1, category });
    // Filter using business logic
    let candidates = products || [];

    if (budgetRange && (budgetRange.min || budgetRange.max)) {
      candidates = candidates.filter((p) => {
        const price = parseFloat(p.price || p.regular_price || 0);
        if (Number.isNaN(price)) return false;
        if (budgetRange.min && price < budgetRange.min) return false;
        if (budgetRange.max && price > budgetRange.max) return false;
        return true;
      });
    }

    // Prefer in-stock items
    candidates = candidates.filter((p) => p.stock_status === 'instock');

    // Sort by popularity (if available) or rating_count
    candidates.sort((a, b) => (b.total_sales || b.rating_count || 0) - (a.total_sales || a.rating_count || 0));

    // Return top 'limit' with minimal fields
    const result = candidates.slice(0, limit).map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      regular_price: p.regular_price,
      sale_price: p.sale_price || null,
      stock_status: p.stock_status,
      images: p.images,
      permalink: p.permalink,
      short_description: p.short_description
    }));

    return result;
  } catch (err) {
    logger.error('recommendationEngine error', err);
    throw err;
  }
}

export default { recommend };
