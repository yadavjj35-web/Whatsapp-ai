// path: /agents/PaymentAgent.js
/**
 * PaymentAgent
 * - Role: generate payment links, verify payments, reconcile
 * - Tools: paymentTools, wooTools, crmTools
 */

import logger from '../utils/logger.js';

const AGENT_NAME = 'PaymentAgent';

const Agent = {
  name: AGENT_NAME,
  description: 'Handles payment link generation and verification',
  allowedTools: ['paymentTools', 'wooTools', 'crmTools'],

  async execute(task, tools) {
    const { type, input } = task;
    logger.info('PaymentAgent executing', { taskId: task.id, type });

    if (type === 'generate_payment_link') {
      const { order } = input;
      const link = await tools.paymentTools.createPaymentLink(order);
      return { summary: 'Payment link generated', link };
    }

    if (type === 'verify_payment') {
      const status = await tools.paymentTools.verifyPayment(input.paymentId);
      return { summary: 'Payment verification', status };
    }

    return { summary: 'Unsupported Payment task' };
  }
};

export default Agent;
