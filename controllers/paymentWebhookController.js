// path: controllers/paymentWebhookController.js
/**
 * Unified Payment Webhook Controller
 *
 * Delegates verification & processing to services/paymentService.verifyAndHandleWebhook
 * Exposes:
 *  - POST /payment/stripe  (raw body)
 *  - POST /payment/razorpay (raw body)
 *
 * Note: use express.raw() for routes to preserve raw body for signature verification.
 */

import express from 'express';
import logger from '../utils/logger.js';
import paymentService from '../services/paymentService.js';

const router = express.Router();

// Stripe webhook
router.post('/stripe', express.raw({ type: '*/*' }), async (req, res, next) => {
  try {
    const sig = req.headers['stripe-signature'] || req.headers['Stripe-Signature'];
    const raw = req.body; // Buffer
    const rec = await paymentService.verifyAndHandleWebhook('stripe', raw, sig);
    return res.status(200).json({ received: true, id: rec._id || rec.id });
  } catch (err) {
    logger.warn('Stripe webhook processing failed', { error: err.message });
    // Return 400 to indicate signature/processing failure
    return res.status(400).json({ error: err.message });
  }
});

// Razorpay webhook
router.post('/razorpay', express.raw({ type: '*/*' }), async (req, res, next) => {
  try {
    const sig = req.headers['x-razorpay-signature'] || req.headers['X-Razorpay-Signature'];
    const raw = req.body; // Buffer
    const rec = await paymentService.verifyAndHandleWebhook('razorpay', raw, sig);
    return res.status(200).json({ ok: true, id: rec._id || rec.id });
  } catch (err) {
    logger.warn('Razorpay webhook processing failed', { error: err.message });
    return res.status(400).json({ error: err.message });
  }
});

export default router;
