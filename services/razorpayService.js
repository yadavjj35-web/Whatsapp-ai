// path: services/razorpayService.js
/**
 * Razorpay Service
 *
 * Production-ready razorpay integration:
 *  - createOrder(order) -> create Razorpay order for checkout
 *  - verifySignature(body, signature, secret) -> verify webhook signature / order signature
 *  - fetchPayment(paymentId)
 *
 * Requirements:
 *  - RAZORPAY_KEY and RAZORPAY_SECRET in env
 *
 * Note:
 *  - This service does not assume a specific checkout flow; it returns the razorpay order object.
 */

import Razorpay from 'razorpay';
import crypto from 'crypto';
import logger from '../utils/logger.js';

const RAZORPAY_KEY = process.env.RAZORPAY_KEY;
const RAZORPAY_SECRET = process.env.RAZORPAY_SECRET;

let razorpay = null;
if (RAZORPAY_KEY && RAZORPAY_SECRET) {
  razorpay = new Razorpay({ key_id: RAZORPAY_KEY, key_secret: RAZORPAY_SECRET });
} else {
  logger.warn('Razorpay not configured (RAZORPAY_KEY/RAZORPAY_SECRET missing)');
}

/**
 * Create a Razorpay order for given order details:
 *  - receipt: unique receipt id
 *  - amount: in currency subunits (e.g., paise) -> expect order.amount in major currency units; convert accordingly
 *  - currency: 'INR' default
 */
export async function createOrder({ receipt, amount, currency = 'INR', notes = {} } = {}) {
  if (!razorpay) throw new Error('Razorpay client not configured');
  // amount expected in major units, convert to paise (100)
  const amountInPaise = Math.round(Number(amount) * 100);
  const payload = {
    amount: amountInPaise,
    currency,
    receipt: receipt || `rcpt_${Date.now()}`,
    notes
  };
  try {
    const order = await razorpay.orders.create(payload);
    logger.info('Razorpay order created', { id: order.id, receipt: payload.receipt, amount: payload.amount });
    return order;
  } catch (err) {
    logger.error('Razorpay createOrder failed', { error: err.message });
    throw err;
  }
}

/**
 * Verify a signature from Razorpay events (webhook or order signature).
 * For webhooks, payload should be raw body string and signature header from 'x-razorpay-signature'.
 */
export function verifySignature(payload, signature, secret = RAZORPAY_SECRET) {
  if (!secret) {
    throw new Error('Razorpay secret not configured for signature verification');
  }
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const valid = expected === signature;
  if (!valid) {
    logger.warn('Razorpay signature verification failed');
  }
  return valid;
}

/**
 * Fetch a payment by id
 */
export async function fetchPayment(paymentId) {
  if (!razorpay) throw new Error('Razorpay client not configured');
  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return payment;
  } catch (err) {
    logger.error('Razorpay fetchPayment failed', { paymentId, error: err.message });
    throw err;
  }
}

export default {
  createOrder,
  verifySignature,
  fetchPayment
};
