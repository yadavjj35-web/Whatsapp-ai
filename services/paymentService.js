// path: services/paymentService.js
import logger from '../utils/logger.js';
import config from '../config/index.js';
import wooService from './wooService.js';
import OrderRecord from '../models/OrderRecord.js';

/**
 * Provides payment-link creation and verification.
 *
 * NOTE: WooCommerce REST API itself doesn't provide payment links out-of-the-box. Common approaches:
 * - Create an order and provide the order pay URL if WooCommerce site supports "Pay for order" endpoint.
 * - Use a payment gateway's hosted payment link (e.g., Stripe Checkout) and provide that link.
 *
 * Here we implement a generic approach:
 * 1) createOrderInWoo: create a pending order in WooCommerce (payment_method = 'bacs' or custom)
 * 2) buildPayUrl: construct pay URL if site supports it: {WC_BASE_URL}/?wc-api=paypal&... (this depends on site)
 *
 * For production, integrate directly with a gateway (Stripe/PayPal) to generate payment sessions.
 */

function buildPayUrl(wooOrder) {
  // Many WooCommerce sites allow order pay via endpoint: /checkout/order-pay/{order_id}/?pay_for_order=true&key={order_key}
  const base = config.wooCommerce.baseUrl.replace(/\/$/, '');
  if (!wooOrder || !wooOrder.id || !wooOrder.order_key) return null;
  return `${base}/checkout/order-pay/${wooOrder.id}/?pay_for_order=true&key=${wooOrder.order_key}`;
}

async function createOrderAndPaymentLink({ customer, items = [], shipping = {}, billing = {} } = {}) {
  // Build order payload following WooCommerce API schema
  const line_items = items.map((it) => ({
    product_id: it.product_id,
    variation_id: it.variation_id || undefined,
    quantity: it.quantity || 1
  }));

  const orderPayload = {
    payment_method: 'bacs',
    payment_method_title: 'Bank Transfer',
    set_paid: false,
    billing: billing || {},
    shipping: shipping || {},
    line_items,
    customer_note: `Created via WhatsApp assistant for ${customer?.phone || 'unknown'}`
  };

  try {
    const wooOrder = await wooService.createOrder(orderPayload);
    // persist
    await OrderRecord.create({
      wooOrderId: wooOrder.id,
      customerPhone: customer?.phone,
      status: wooOrder.status,
      total: parseFloat(wooOrder.total || 0),
      currency: wooOrder.currency,
      items: wooOrder.line_items || [],
      raw: wooOrder
    });

    const payUrl = buildPayUrl(wooOrder);
    return { wooOrder, payUrl };
  } catch (err) {
    logger.error('createOrderAndPaymentLink error', err);
    throw err;
  }
}

async function getOrderStatus(wooOrderId) {
  try {
    const order = await wooService.getOrder(wooOrderId);
    return order;
  } catch (err) {
    logger.error('getOrderStatus error', err);
    throw err;
  }
}

export default { createOrderAndPaymentLink, getOrderStatus };
