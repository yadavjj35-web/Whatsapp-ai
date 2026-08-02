// path: /security/roleManager.js
/**
 * Role Manager
 * - Defines roles and their permissions
 */

const roles = {
  owner: { canApprove: true, canExecuteSensitive: true, canManageAgents: true },
  admin: { canApprove: true, canExecuteSensitive: true, canManageAgents: false },
  user: { canApprove: false, canExecuteSensitive: false, canManageAgents: false }
};

function getRole(roleName) {
  return roles[roleName] || {};
}

export default { getRole };
