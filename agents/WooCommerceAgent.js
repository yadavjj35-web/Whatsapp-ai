// path: /agents/WooCommerceAgent.js
/**
 * WooCommerceAgent
 * - Role: direct interface to WooCommerce for product search, details, orders
 * - Permitted tools: wooTools
 */

import logger from '../utils/logger.js';
import prompts from '../prompts/agentPromptBuilder.js';

const AGENT_NAME = 'WooCommerceAgent';

const Agent = {
  name: AGENT_NAME,
  description: 'Agent to interact with WooCommerce platform using safe tools',
  allowedTools: ['wooTools'],
  prompt: prompts.agentPrompt('woo'),
  guardrails: {
    alwaysFetchLive: true
  },

  async execute(task, tools) {
    const { type, input } = task;
    logger.info('WooCommerceAgent executing', { taskId: task.id, type });

    if (type === 'product_search') {
      const q = input.query || '';
      const data = await tools.wooTools.search({ q, limit: input.limit || 10 });
      return { summary: `Found ${data.length} products`, products: data };
    }

    if (type === 'get_product') {
      const product = await tools.wooTools.getById(input.productId);
      return { summary: `Product ${product?.name || input.productId}`, product };
    }

    if (type === 'create_order') {
      const order = await tools.wooTools.createOrder(input.order);
      return { summary: `Order ${order.id} created`, order };
    }

    return { summary: 'Unsupported Woo task' };
  }
};

export default Agent;
