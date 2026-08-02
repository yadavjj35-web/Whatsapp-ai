// path: /monitoring/agentMonitor.js
/**
 * Agent Monitor - basic tracking of agent event rates and errors
 */

import agentRegistry from '../agents/agentRegistry.js';

function listAgents() {
  return agentRegistry.listAgents();
}

export default { listAgents };
