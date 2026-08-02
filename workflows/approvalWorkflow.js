// path: /workflows/approvalWorkflow.js
/**
 * Approval Workflow
 * - Standard workflow to request approval and execute action upon approval
 */

import approvalManager from '../owner/approvalManager.js';
import orchestrator from '../agents/orchestratorAgent.js';
import workflowCoordinator from '../agents/workflowCoordinator.js';
import logger from '../utils/logger.js';

async function requestAndExecute({ owner, command, parsed }, executeIfApproved = true) {
  const approvalId = await approvalManager.createApprovalRequest({ owner, command, parsed });
  // Register workflow for tracking
  await workflowCoordinator.registerWorkflow(approvalId, { context: { owner, command }, plan: { summary: 'approval pending', tasks: [] } });
  // Return approval id and pending status
  return { approvalId, status: 'pending' };
}

async function onApproval(approvalId) {
  const approval = approvalManager.getApproval(approvalId);
  if (!approval || approval.status !== 'approved') throw new Error('Approval not found or not approved');
  // Execute the parsed command via orchestrator
  const result = await orchestrator.execute({ owner: approval.owner, command: approval.command, payload: approval.parsed.payload });
  await workflowCoordinator.markWorkflowCompleted(approvalId, result);
  return result;
}

export default { requestAndExecute, onApproval };
