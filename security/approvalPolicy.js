// path: /security/approvalPolicy.js
/**
 * Approval Policy utility - encapsulates approval logic
 */

import policyEngine from './policyEngine.js';

function needsApproval(action) {
  return policyEngine.requiresApproval(action);
}

export default { needsApproval };
