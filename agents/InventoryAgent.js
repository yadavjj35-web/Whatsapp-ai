// path: /agents/InventoryAgent.js
/**
 * InventoryAgent
 * - Role: manage stock levels, trigger reorder recommendations
 * - Tools: inventoryTools, notificationTools, crmTools
 */

import logger from '../utils/logger.js';

const AGENT_NAME = 'InventoryAgent';

const Agent = {
  name: AGENT_NAME,
  description: 'Manages inventory checks and replenishment recommendations',
  allowedTools: ['inventoryTools', 'notificationTools', 'crmTools'],

  async execute(task, tools) {
    const { type, input } = task;
    logger.info('InventoryAgent executing', { taskId: task.id, type });

    if (type === 'inventory_audit') {
      const threshold = input.threshold || 5;
      const lowStock = await tools.inventoryTools.findLowStock({ threshold });
      // Notify owner
      if (lowStock.length && tools.notificationTools.notifyOwner) {
        await tools.notificationTools.notifyOwner({ subject: 'Low stock alert', body: `${lowStock.length} items below threshold` });
      }
      return { summary: 'Inventory audit complete', lowStockCount: lowStock.length, items: lowStock };
    }

    return { summary: 'Unsupported Inventory task' };
  }
};

export default Agent;
