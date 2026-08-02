// path: /agents/OrderAgent.js
/**
 * OrderAgent
 * - Role: manage order creation, updates, cancellations
 * - Tools: wooTools, paymentTools, crmTools
 */

import logger from '../utils/logger.js';

const AGENT_NAME = 'OrderAgent';

const Agent = {
  name: AGENT_NAME,
  description: 'Handles order lifecycle actions',
  allowedTools: ['wooTools', 'paymentTools', 'crmTools'],

  async execute(task, tools) {
    const { type, input } = task;
    logger.info('OrderAgent executing', { taskId: task.id, type });

    if (type === 'create_order') {
      const order = await tools.wooTools.createOrder(input.order);
      // Optionally create CRM activity
      if (tools.crmTools && input.createActivity) {
        await tools.crmTools.createActivity({ orderId: order.id, note: 'Order created via agent' });
      }
      return { summary: `Order ${order.id} created`, order };
    }

    if (type === 'cancel_order') {
      const canceled = await tools.wooTools.updateOrderStatus(input.orderId, 'cancelled');
      return { summary: `Order ${input.orderId} cancelled`, canceled };
    }

    return { summary: 'Unsupported Order task' };
  }
};

export default Agent;
