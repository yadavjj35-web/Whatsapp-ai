// path: /owner/approvalManager.js
/**
 * Approval Manager
 * - Create and track approval requests
 * - Use in-memory store for approvals (production should persist)
 */

import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const approvals = new Map();

function requiresApproval(action) {
  const sensitive = ['find_low_stock', 'inventory_update', 'generate_invoice', 'financial_workflow'];
  return sensitive.includes(action);
}

async function createApprovalRequest({ owner, command, parsed }) {
  const id = uuidv4();
  const req = {
    id,
    owner,
    command,
    parsed,
    status: 'pending',
    createdAt: new Date()
  };
  approvals.set(id, req);
  logger.info('Approval request created', { id, owner, action: parsed.action });
  return id;
}

function getApproval(id) {
  return approvals.get(id);
}

function approve(id, approver) {
  const r = approvals.get(id);
  if (!r) throw new Error('Approval not found');
  r.status = 'approved';
  r.approvedAt = new Date();
  r.approver = approver;
  return r;
}

function reject(id, approver, reason) {
  const r = approvals.get(id);
  if (!r) throw new Error('Approval not found');
  r.status = 'rejected';
  r.rejectedAt = new Date();
  r.rejectedBy = approver;
  r.reason = reason;
  return r;
}

export default { requiresApproval, createApprovalRequest, getApproval, approve, reject };
