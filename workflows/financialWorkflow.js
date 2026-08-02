// path: /workflows/financialWorkflow.js
/**
 * Financial Workflow
 * - For payments, invoice generation, refunds etc.
 * - Requires strict approval and audit logging
 */

import approvalManager from '../owner/approvalManager.js';
import orchestrator from '../agents/orchestratorAgent.js';
import logger from '../utils/logger.js';
import workflowCoordinator from '../agents/workflowCoordinator.js';

async function initiateFinancialAction({ owner, command, payload }) {
  // Always require approval
  const approvalId = await approvalManager.createApprovalRequest({ owner, command, parsed: { action: 'financial_workflow', payload } });
  await workflowCoordinator.registerWorkflow(approvalId, { context: { owner, command }, plan: { summary: 'financial action pending' } });
  return { approvalId, status: 'pending' };
}

async function executeAfterApproval(approvalId) {
  const approval = approvalManager.getApproval(approvalId);
  if (!approval || approval.status !== 'approved') throw new Error('Approval missing or not approved');
  // Execute underlying action (e.g., create invoice)
  const result = await orchestrator.execute({ owner: approval.owner, command: approval.command, payload: approval.parsed.payload });
  await workflowCoordinator.markWorkflowCompleted(approvalId, result);
  return result;
}

export default { initiateFinancialAction, executeAfterApproval };
