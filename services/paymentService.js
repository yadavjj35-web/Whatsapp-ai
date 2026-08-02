// path: services/paymentService.js
/**
 * Unified Payment Service
 *
 * Wraps provider-specific implementations (stripeService, razorpayService) and centralizes:
 *  - checkout creation
 *  - webhook verification dispatch
 *  - unified event handling and persistence to PaymentRecord
 *  - reconciliation with OrderRecord and Workflows
 *
 * Exports:
 *  - createCheckoutSession(provider, payload)
 *  - verifyAndHandleWebhook(provider, rawBody, signatureHeader)
 *  - retrievePayment(provider, id)
 */

import stripeService from './stripeService.js';
import razorpayService from './razorpayService.js';
import PaymentRecord from '../models/PaymentRecord.js';
import OrderRecord from '../models/OrderRecord.js';
import Workflow from '../models/Workflow.js';
import logger from '../utils/logger.js';

/**
 * Create checkout session (provider: 'stripe' | 'razorpay')
 */
export async function createCheckoutSession(provider, payload) {
  if (!provider) throw new Error('provider required');
  if (provider === 'stripe') {
    return stripeService.createCheckoutSession(payload);
  }
  if (provider === 'razorpay') {
    // For razorpay, createOrder then return order details for client to use
    return razorpayService.createOrder(payload);
  }
  throw new Error(`Unsupported payment provider: ${provider}`);
}

/**
 * Verify webhook signature and process event for provider
 * - rawBody: Buffer or string
 * - signatureHeader: provider signature header value
 *
 * Returns the persisted PaymentRecord
 */
export async function verifyAndHandleWebhook(provider, rawBody, signatureHeader) {
  try {
    let event = null;
    if (provider === 'stripe') {
      event = stripeService.verifyWebhook(rawBody, signatureHeader);
      // Extract sensible fields
      const data = event.data?.object || {};
      const providerEventId = event.id;
      const amount = (data.amount || data.amount_total || data.amount_paid) || null;
      const currency = data.currency || null;
      const orderId = data.metadata?.orderId || data.metadata?.order_id || null;
      const status = data.status || event.type;
      const rec = await PaymentRecord.recordEvent({
        provider: 'stripe',
        providerEventId,
        orderId,
        amount,
        currency,
        status,
        rawEvent: event
      });

      // Try reconciliation
      if (orderId) {
        try {
          const order = await OrderRecord.findOne({ orderId }) || await OrderRecord.findById(orderId).catch(() => null);
          if (order) {
            order.payment = order.payment || {};
            order.payment.provider = 'stripe';
            order.payment.providerEventId = providerEventId;
            order.payment.status = status;
            await order.save();
          }
        } catch (e) {
          logger.warn('Payment service reconciliation (stripe) failed', { orderId, error: e.message });
        }
      }

      // Link to workflow by correlationId (if present)
      if (orderId) {
        try {
          const wf = await Workflow.findOne({ correlationId: String(orderId) });
          if (wf) await wf.appendLog('info', 'Stripe payment event processed', { providerEventId, status });
        } catch (e) {
          // ignore
        }
      }

      return rec;
    }

    if (provider === 'razorpay') {
      const rawString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
      // Verify signature
      const valid = razorpayService.verifySignature(rawString, signatureHeader);
      if (!valid) throw new Error('Invalid Razorpay signature');
      const event = JSON.parse(rawString);
      const providerEventId = event?.payload?.payment?.entity?.id || event?.payload?.order?.entity?.id || event.event;
      const amount = event?.payload?.payment?.entity?.amount ? event.payload.payment.entity.amount / 100 : null;
      const currency = event?.payload?.payment?.entity?.currency || null;
      const orderId = event?.payload?.payment?.entity?.notes?.order_id || null;
      const status = event?.event || (event?.payload?.payment?.entity?.status) || null;

      const rec = await PaymentRecord.recordEvent({
        provider: 'razorpay',
        providerEventId,
        orderId,
        amount,
        currency,
        status,
        rawEvent: event
      });

      if (orderId) {
        try {
          const order = await OrderRecord.findOne({ orderId }) || await OrderRecord.findById(orderId).catch(() => null);
          if (order) {
            order.payment = order.payment || {};
            order.payment.provider = 'razorpay';
            order.payment.providerEventId = providerEventId;
            order.payment.status = status;
            await order.save();
          }
        } catch (e) {
          logger.warn('Razorpay reconciliation failed', { orderId, error: e.message });
        }
      }

      if (orderId) {
        try {
          const wf = await Workflow.findOne({ correlationId: String(orderId) });
          if (wf) await wf.appendLog('info', 'Razorpay payment event processed', { providerEventId, status });
        } catch (e) {
          // ignore
        }
      }

      return rec;
    }

    throw new Error(`Unsupported provider: ${provider}`);
  } catch (err) {
    logger.error('verifyAndHandleWebhook error', { provider, error: err.message });
    throw err;
  }
}

/**
 * Retrieve payment / reconciliation info
 */
export async function retrievePayment(provider, id) {
  if (provider === 'stripe') return stripeService.retrievePaymentIntent(id);
  if (provider === 'razorpay') return razorpayService.fetchPayment(id);
  throw new Error(`Unsupported provider: ${provider}`);
}

export default {
  createCheckoutSession,
  verifyAndHandleWebhook,
  retrievePayment
};
