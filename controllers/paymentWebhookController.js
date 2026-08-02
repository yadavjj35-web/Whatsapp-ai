// path: controllers/paymentWebhookController.js
/**
 * Payment Webhook Controller
 *
 * Routes:
 *  - POST /webhooks/stripe    -> handles Stripe webhook events
 *  - POST /webhooks/razorpay  -> handles Razorpay webhook events
 *
 * Requirements:
 *  - server.js must preserve raw request body as req.rawBody (string or Buffer)
 *  - STRIPE_WEBHOOK_SECRET (for stripe signature verification)
 *  - RAZORPAY_SECRET (for razorpay signature verification) or Razorpay verification handled via service
 *
 * Behavior:
 *  - Verifies signature for incoming events
 *  - Parses event and persists a PaymentRecord
 *  - Attempts reconciliation/upsert on OrderRecord if orderId present in metadata
 *  - Emits structured logs and appends audit entries
 *
 * Note: This controller is safe to mount without authentication (webhooks are authenticated by provider signatures).
 */

import express from 'express';
import logger from '../utils/logger.js';
import stripeService from '../services/stripeService.js';
import razorpayService from '../services/razorpayService.js';
import PaymentRecord from '../models/PaymentRecord.js';
import Workflow from '../models/Workflow.js';
import OrderRecord from '../models/OrderRecord.js';

const router = express.Router();

/**
 * Helper: persist a payment event
 */
async function persistPaymentEvent({ provider, providerEventId, payload, raw, orderId, amount, currency, status }) {
  try {
    const rec = await PaymentRecord.create({
      provider,
      providerEventId,
      orderId: orderId || null,
      amount: amount || null,
      currency: currency || null,
      status: status || null,
      rawEvent: raw || payload || {},
      receivedAt: new Date()
    });
    return rec;
  } catch (err) {
    logger.error('Failed to persist payment event', { provider, providerEventId, error: err.message });
    throw err;
  }
}

/**
 * Stripe webhook endpoint
 * Must read raw body (req.rawBody) for signature verification
 */
router.post('/stripe', express.raw({ type: '*/*' }), async (req, res, next) => {
  try {
    const sigHeader = req.headers['stripe-signature'] || req.headers['Stripe-Signature'];
    const rawBody = req.body; // express.raw gives Buffer
    if (!rawBody) {
      // fallback to req.rawBody if express.json verify captured it as string
      if (req.rawBody) {
        // convert to Buffer
        rawBody = Buffer.from(req.rawBody, 'utf8');
      } else {
        logger.warn('Stripe webhook missing raw body');
        return res.status(400).send('Missing raw body');
      }
    }

    let event;
    try {
      // stripeService.verifyWebhook throws if verification fails
      event = stripeService.verifyWebhook(rawBody, sigHeader);
    } catch (err) {
      logger.warn('Stripe webhook signature verification failed', { message: err.message });
      return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
    }

    const eventType = event.type;
    const data = event.data?.object || {};
    const providerEventId = event.id;

    // Persist payment event
    const amount = data.amount_total || data.amount || (data.amount_paid ?? null);
    const currency = data.currency || data.currency_code || null;
    const orderId = data.metadata?.orderId || (data.metadata && data.metadata.order_id) || null;

    const rec = await persistPaymentEvent({
      provider: 'stripe',
      providerEventId,
      payload: data,
      raw: event,
      orderId,
      amount,
      currency,
      status: data.status || eventType
    });

    // Attempt basic reconciliation: link to OrderRecord if orderId present
    if (orderId) {
      try {
        const order = await OrderRecord.findOne({ orderId }) || (await OrderRecord.findOne({ _id: orderId }));
        if (order) {
          order.payment = order.payment || {};
          order.payment.provider = 'stripe';
          order.payment.status = data.status || eventType;
          order.payment.providerEventId = providerEventId;
          await order.save();
        }
      } catch (err) {
        logger.warn('Failed to reconcile Stripe payment with order', { orderId, error: err.message });
      }
    }

    // Optionally update workflows waiting for payment via correlationId
    if (orderId) {
      try {
        const wf = await Workflow.findOne({ correlationId: String(orderId) });
        if (wf) {
          await wf.appendLog('info', 'Payment event received', { provider: 'stripe', providerEventId, status: data.status });
        }
      } catch (err) {
        logger.warn('Failed to append workflow log for payment', { orderId, error: err.message });
      }
    }

    // Return 200 to stripe
    res.status(200).json({ received: true, recordId: rec._id });
  } catch (err) {
    logger.error('Stripe webhook handling error', { error: err.message });
    return next(err);
  }
});

/**
 * Razorpay webhook endpoint
 *
 * Razorpay sends signature in header 'x-razorpay-signature'
 * We expect raw body string for signature verification; express.raw used above for stripe,
 * so here ensure raw body is available similarly.
 */
router.post('/razorpay', express.raw({ type: '*/*' }), async (req, res, next) => {
  try {
    const signatureHeader = req.headers['x-razorpay-signature'] || req.headers['X-Razorpay-Signature'];
    const rawBodyBuf = req.body || (req.rawBody ? Buffer.from(req.rawBody, 'utf8') : null);
    if (!rawBodyBuf) {
      logger.warn('Razorpay webhook missing raw body');
      return res.status(400).send('Missing raw body');
    }
    const rawString = rawBodyBuf.toString('utf8');

    // Verify signature using razorpayService
    const valid = razorpayService.verifySignature(rawString, signatureHeader);
    if (!valid) {
      logger.warn('Razorpay webhook verification failed');
      return res.status(400).send('Invalid signature');
    }

    const event = JSON.parse(rawString);
    const providerEventId = event?.payload?.payment?.entity?.id || event?.payload?.order?.entity?.id || event?.event;
    const status = event?.event || (event?.payload?.payment?.entity?.status) || null;
    const amount = event?.payload?.payment?.entity?.amount / 100 || null;
    const currency = event?.payload?.payment?.entity?.currency || null;
    // Attempt to extract order id from notes/metadata
    const orderId = event?.payload?.payment?.entity?.notes?.order_id || null;

    const rec = await persistPaymentEvent({
      provider: 'razorpay',
      providerEventId,
      payload: event,
      raw: event,
      orderId,
      amount,
      currency,
      status
    });

    // Reconciliation similar to stripe
    if (orderId) {
      try {
        const order = await OrderRecord.findOne({ orderId }) || (await OrderRecord.findOne({ _id: orderId }));
        if (order) {
          order.payment = order.payment || {};
          order.payment.provider = 'razorpay';
          order.payment.status = status;
          order.payment.providerEventId = providerEventId;
          await order.save();
        }
      } catch (err) {
        logger.warn('Failed to reconcile Razorpay payment with order', { orderId, error: err.message });
      }
    }

    // Optionally link to workflow by correlationId
    if (orderId) {
      try {
        const wf = await Workflow.findOne({ correlationId: String(orderId) });
        if (wf) {
          await wf.appendLog('info', 'Payment event received (razorpay)', { providerEventId, status });
        }
      } catch (err) {
        logger.warn('Failed to append workflow log for razorpay payment', { orderId, error: err.message });
      }
    }

    res.status(200).json({ ok: true, recordId: rec._id });
  } catch (err) {
    logger.error('Razorpay webhook handling error', { error: err.message });
    return next(err);
  }
});

export default router;
