// path: /security/permissionEngine.js
/**
 * Permission Engine
 * - Evaluates policies and guardrails for actions and agents
 */

import roleManager from './roleManager.js';

function isAgentAllowed(agentName) {
  // For now, all agents are allowed unless explicitly blocked by environment
  const blocked = (process.env.BLOCKED_AGENTS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return !blocked.includes(agentName);
}

function canExecute(user, action) {
  const role = roleManager.getRole(user?.role || 'user');
  if (action === 'approve') return !!role.canApprove;
  if (action === 'execute_sensitive') return !!role.canExecuteSensitive;
  return true;
}

export default { isAgentAllowed, canExecute };
