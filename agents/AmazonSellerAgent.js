// path: /agents/AmazonSellerAgent.js
/**
 * AmazonSellerAgent
 * - Role: sync products/orders with Amazon (SP-API)
 * - Allowed tools: amazonTools, inventoryTools
 */

import logger from '../utils/logger.js';

const AGENT_NAME = 'AmazonSellerAgent';

const Agent = {
  name: AGENT_NAME,
  description: 'Handles Amazon Seller central integration and syncing',
  allowedTools: ['amazonTools', 'inventoryTools'],
  prompt: 'Amazon Seller integration agent',

  async execute(task, tools) {
    const { type, input } = task;
    logger.info('AmazonSellerAgent executing', { taskId: task.id, type });

    if (type === 'sync_product') {
      const res = await tools.amazonTools.syncProduct(input.product);
      return { summary: 'Product sync scheduled', result: res };
    }

    if (type === 'sync_inventory') {
      const res = await tools.amazonTools.syncInventory(input.skus || []);
      return { summary: 'Inventory sync executed', result: res };
    }

    return { summary: 'Unsupported Amazon task' };
  }
};

export default Agent;
