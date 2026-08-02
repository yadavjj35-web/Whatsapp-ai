// path: controllers/orderController.js
import paymentService from '../services/paymentService.js';
import logger from '../utils/logger.js';
import Customer from '../models/Customer.js';
import OrderRecord from '../models/OrderRecord.js';

/**
 * - POST /api/v1/orders/create : create order & return pay link
 * - GET  /api/v1/orders/:id     : get order status
 */

export async function createOrder(req, res, next) {
  try {
    const { phone, items, shipping, billing, customer } = req.body;
    if (!phone || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Missing required fields (phone, items)' });
    }

    // Save or update basic customer info
    await Customer.findOneAndUpdate({ phone }, { $set: { name: (customer && customer.name) || undefined, phone } }, { upsert: true });

    const result = await paymentService.createOrderAndPaymentLink({
      customer: { phone, ...customer },
      items,
      shipping,
      billing
    });

    return res.json({ success: true, payment: { payUrl: result.payUrl }, order: result.wooOrder });
  } catch (err) {
    logger.error('createOrder controller error', err);
    return next(err);
  }
}

export async function getOrder(req, res, next) {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ success: false, error: 'Missing order id' });

    // Try local cache first
    const rec = await OrderRecord.findOne({ wooOrderId: id });
    let order;
    try {
      order = await paymentService.getOrderStatus(id);
    } catch (err) {
      // If live fetch fails, fallback to cached
      order = rec && rec.raw;
      if (!order) throw err;
    }

    return res.json({ success: true, data: order });
  } catch (err) {
    logger.error('getOrder controller error', err);
    return next(err);
  }
}
