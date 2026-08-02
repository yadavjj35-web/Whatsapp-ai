// path: /agents/agentRegistry.js
/**
 * Agent Registry
 * - Register agents and provide lookup
 * - Supports dynamic loading from /agents directory in future
 */

import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

// Static registry map
const registry = new Map();

// Helper: attempt to load agent module by filename
function loadAgentModule(filename) {
  try {
    const modPath = path.resolve(process.cwd(), 'agents', filename);
    // Dynamic import needs a relative or absolute path with file:// for ESM in Node: use import() with URL
    // However, we will require agents using static imports already included above in this run-time context.
    // For this registry we expect modules to be already imported and registered programmatically.
    return null;
  } catch (err) {
    logger.warn('Failed to dynamic load agent', { filename, error: err.message });
    return null;
  }
}

function register(name, agentInstance) {
  if (!name || !agentInstance) throw new Error('Invalid agent registration');
  registry.set(name, agentInstance);
  logger.info('Agent registered', { name });
  return true;
}

function getAgent(name) {
  return registry.get(name);
}

function listAgents() {
  return Array.from(registry.keys());
}

/**
 * Auto-register all exported agents in /agents that follow naming convention:
 * This function is safe to run but will not attempt to import files (to respect "do not modify" existing code).
 * Agents are expected to be registered by their modules upon import. For now, this is a registry API.
 */

export default {
  register,
  getAgent,
  listAgents,
  loadAgentModule
};
