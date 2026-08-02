// path: controllers/orderController.js
/**
 * Order Controller
 *
 * Endpoints:
 *  - POST /orders/create -> create local order and start payment checkout session
 *  - GET  /orders/:id    -> retrieve order
 *  - POST /orders/:id/capture -> capture/confirm payment (if applicable)
 *
 * Integrates with:
 *  - services/paymentService.createCheckoutSession
 *  - models/OrderRecord (assumed to exist)
 *  - models/PaymentRecord for reconciliation
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import paymentService from '../services/paymentService.js';
import OrderRecord from '../models/OrderRecord.js'; // assume exists
import PaymentRecord from '../models/PaymentRecord.js';

const router = express.Router();

/**
 * Create order and initiate checkout
 * Body: { provider: 'stripe'|'razorpay', order: { items, currency, customerEmail }, successUrl, cancelUrl }
 */
router.post('/create', async (req, res, next) => {
  try {
    const { provider = 'stripe', order = {}, successUrl, cancelUrl, customerEmail } = req.body;
    // create minimal OrderRecord
    const orderId = `order_${Date.now()}_${uuidv4()}`;
    const orderRec = await OrderRecord.create({
      orderId,
      items: order.items || [],
      currency: order.currency || 'USD',
      total: order.total || 0,
      customerEmail: customerEmail || null,
      status: 'pending',
      createdAt: new Date()
    });

    // Create checkout session
    const payload = {
      order: { id: orderId, items: orderRec.items, currency: orderRec.currency, total: orderRec.total },
      successUrl,
      cancelUrl,
      metadata: { orderId },
      customerEmail
    };

    const session = await paymentService.createCheckoutSession(provider, payload);

    // Persist a PaymentRecord placeholder (best-effort)
    try {
      await PaymentRecord.recordEvent({
        provider,
        providerEventId: session.id || session?.order?.id || `init_${orderId}`,
        orderId,
        amount: orderRec.total,
        currency: orderRec.currency,
        status: 'checkout_created',
        rawEvent: session
      });
    } catch (e) {
      logger.warn('Failed to persist payment init record', { orderId, error: e.message });
    }

    return res.status(201).json({ success: true, orderId, checkout: session });
  } catch (err) {
    logger.error('Create order failed', { error: err.message });
    return next(err);
  }
});

/**
 * Get order details
 */
router.get('/:id', async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const order = await OrderRecord.findOne({ orderId });
    if (!order) return res.status(404).json({ success: false, error: 'Not found' });
    return res.json({ success: true, order });
  } catch (err) {
    logger.error('Get order failed', { error: err.message });
    return next(err);
  }
});

export default router;
