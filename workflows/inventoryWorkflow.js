// path: /workflows/inventoryWorkflow.js
/**
 * Inventory Workflow
 * - Handles restock approvals, supplier notifications, and reconciliation
 */

import orchestrator from '../agents/orchestratorAgent.js';
import approvalManager from '../owner/approvalManager.js';
import workflowCoordinator from '../agents/workflowCoordinator.js';
import logger from '../utils/logger.js';

async function requestRestockApproval({ owner, items }) {
  const command = `Restock items: ${items.map((i) => `${i.sku}:${i.qty}`).join(',')}`;
  const parsed = { action: 'inventory_update', payload: { items } };
  const approvalId = await approvalManager.createApprovalRequest({ owner, command, parsed });
  await workflowCoordinator.registerWorkflow(approvalId, { context: { owner, items }, plan: { summary: 'restock approval' } });
  return { approvalId, status: 'pending' };
}

async function executeRestock(approvalId) {
  const approval = approvalManager.getApproval(approvalId);
  if (!approval || approval.status !== 'approved') throw new Error('Not approved');
  const result = await orchestrator.execute({ owner: approval.owner, command: approval.command, payload: approval.parsed.payload });
  await workflowCoordinator.markWorkflowCompleted(approvalId, result);
  return result;
}

export default { requestRestockApproval, executeRestock };
