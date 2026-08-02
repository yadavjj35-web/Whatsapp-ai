// path: /tools/paymentTools.js
/**
 * Payment Tools wrapper delegating to services/paymentService.js
 */

import paymentService from '../services/paymentService.js';

async function createPaymentLink(order) {
  const { wooOrder, payUrl } = await paymentService.createOrderAndPaymentLink({ order });
  return { wooOrder, payUrl };
}

async function verifyPayment(paymentId) {
  return paymentService.getOrderStatus(paymentId);
}

export default { createPaymentLink, verifyPayment };
