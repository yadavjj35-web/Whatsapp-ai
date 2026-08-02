// path: /integrations/n8n/n8nClient.js
/**
 * n8n Client
 * - Minimal client to trigger workflows via HTTP
 * - Expects N8N_WEBHOOK_BASE_URL in env for webhook triggers
 */

import axios from 'axios';
import logger from '../../utils/logger.js';

const BASE = process.env.N8N_WEBHOOK_BASE_URL || '';

async function triggerWorkflow(workflowId, payload = {}) {
  if (!BASE) throw new Error('N8N webhook base URL not configured');
  const url = `${BASE}/webhook/${workflowId}`;
  const resp = await axios.post(url, payload, { timeout: 10000 });
  logger.info('n8n triggerWorkflow', { workflowId, status: resp.status });
  return resp.data;
}

async function workflowStatus(workflowId) {
  // n8n self-hosted may have a REST API; not all deployments expose it.
  return { workflowId, status: 'unknown' };
}

async function createFollowUpWorkflow(leadId, sequence) {
  // Placeholder: create a workflow via n8n API if available
  return { success: true, workflowId: `followup-${leadId}-${Date.now()}` };
}

export default { triggerWorkflow, workflowStatus, createFollowUpWorkflow };
