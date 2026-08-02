// path: /owner/ownerController.js
/**
 * Owner Controller - HTTP endpoints (to be wired by existing route system)
 * - Receives owner commands and delegates to Orchestrator
 */

import orchestrator from '../agents/orchestratorAgent.js';
import commandParser from './commandParser.js';
import approvalManager from './approvalManager.js';
import permissionManager from './permissionManager.js';
import logger from '../utils/logger.js';

async function handleCommand(req, res, next) {
  try {
    const { command, owner } = req.body;
    if (!command) return res.status(400).json({ success: false, error: 'Missing command' });

    // Permission check
    if (!permissionManager.isOwner(owner || req.user)) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const parsed = await commandParser.parse(command);
    // If action requires approval, create approval request
    if (approvalManager.requiresApproval(parsed.action)) {
      const approvalId = await approvalManager.createApprovalRequest({ owner, command, parsed });
      return res.json({ success: true, approvalRequired: true, approvalId });
    }

    // Otherwise orchestrate execution
    const result = await orchestrator.execute({ owner, command, payload: parsed.payload });
    return res.json({ success: true, result });
  } catch (err) {
    logger.error('ownerController.handleCommand error', err);
    return next(err);
  }
}

export default { handleCommand };
