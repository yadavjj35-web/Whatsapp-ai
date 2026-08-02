// path: /security/policyEngine.js
/**
 * Policy Engine
 * - Evaluates policies and returns decisions
 */

function requiresApproval(action) {
  const sensitive = ['inventory_update', 'financial_workflow', 'cancel_order'];
  return sensitive.includes(action);
}

export default { requiresApproval };
