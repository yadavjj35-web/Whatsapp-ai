// path: /workflows/campaignWorkflow.js
/**
 * Campaign Workflow
 * - Initiates marketing campaigns with safety checks and scheduling
 */

import orchestrator from '../agents/orchestratorAgent.js';
import workflowCoordinator from '../agents/workflowCoordinator.js';

async function startCampaign({ owner, campaign }) {
  const id = `campaign-${Date.now()}`;
  await workflowCoordinator.registerWorkflow(id, { context: { owner, campaign }, plan: { summary: `campaign ${campaign.name}` } });
  // Orchestrate marketing tasks
  const result = await orchestrator.execute({ owner, command: `start campaign ${campaign.name}`, payload: { campaign } });
  await workflowCoordinator.markWorkflowCompleted(id, result);
  return result;
}

export default { startCampaign };
