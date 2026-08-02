// path: services/stripeService.js
/**
 * Stripe Service
 *
 * Production-ready Stripe integration:
 *  - createCheckoutSession(order) -> returns session URL
 *  - verifyWebhook(rawBody, signature) -> returns event object
 *  - retrievePaymentIntent(paymentIntentId)
 *
 * Requirements:
 *  - STRIPE_SECRET_KEY in env
 *  - STRIPE_WEBHOOK_SECRET in env (for webhook verification)
 *
 * Uses official stripe npm package.
 */

import Stripe from 'stripe';
import logger from '../utils/logger.js';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' }) : null;

if (!stripe) {
  logger.warn('Stripe is not configured - STRIPE_SECRET_KEY missing');
}

export async function createCheckoutSession({ order, successUrl, cancelUrl, metadata = {}, customerEmail } = {}) {
  if (!stripe) throw new Error('Stripe client not configured');

  // Build line_items from order.items if present
  const lineItems = (order.items || []).map((it) => ({
    price_data: {
      currency: (order.currency || 'usd').toLowerCase(),
      product_data: {
        name: it.name || `Product ${it.product_id}`
      },
      unit_amount: Math.round(Number(it.unit_price || it.price || 0) * 100)
    },
    quantity: it.quantity || 1
  }));

  // Create session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { ...metadata, orderId: String(order.id) },
    customer_email: customerEmail || undefined
  });

  logger.info('Stripe checkout session created', { sessionId: session.id, orderId: order.id });
  return session;
}

/**
 * Verify webhook signature and return stripe Event
 * rawBody: raw request body buffer/string (must be raw)
 * sigHeader: value of 'stripe-signature' header
 */
export function verifyWebhook(rawBody, sigHeader) {
  if (!STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET not configured for webhook verification');
  try {
    const event = stripe.webhooks.constructEvent(rawBody, sigHeader, STRIPE_WEBHOOK_SECRET);
    return event;
  } catch (err) {
    logger.error('Stripe webhook verification failed', { message: err.message });
    throw err;
  }
}

/**
 * Retrieve a payment intent or charge for reconciliation
 */
export async function retrievePaymentIntent(paymentIntentId) {
  if (!stripe) throw new Error('Stripe client not configured');
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    return pi;
  } catch (err) {
    logger.error('Stripe retrievePaymentIntent failed', { paymentIntentId, error: err.message });
    throw err;
  }
}

export default {
  createCheckoutSession,
  verifyWebhook,
  retrievePaymentIntent
};
