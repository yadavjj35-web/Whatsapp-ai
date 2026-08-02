// path: agents/agentRegistry.js
/**
 * Agent Registry
 *
 * - Central registration and lookup for agent implementations.
 * - Agents must expose `name` and `execute(payload, tools, meta)` async function.
 * - Supports dynamic registration at runtime and optional auto-discovery in the agents folder.
 */

import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

const registry = new Map();

/**
 * Register an agent instance or factory
 * - agentObj must have `.name` and `.execute` (function)
 */
export function registerAgent(agentObj) {
  if (!agentObj || !agentObj.name || typeof agentObj.execute !== 'function') {
    throw new Error('Invalid agent object for registration');
  }
  registry.set(agentObj.name, agentObj);
  logger.info('Agent registered', { name: agentObj.name });
}

/**
 * Get an agent by name
 */
export function getAgent(name) {
  if (!name) return null;
  return registry.get(name) || null;
}

/**
 * List agent names
 */
export function listAgents() {
  return Array.from(registry.keys());
}

/**
 * Auto-discover agents from ./agents directory (attempt to require files that export agent objects)
 */
export function autoDiscoverAgents({ dir = path.resolve(process.cwd(), 'agents') } = {}) {
  try {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isFile() && ent.name !== path.basename(__filename) && ent.name.endsWith('.js')) {
        try {
          const modulePath = path.join(dir, ent.name);
          // Dynamic import to ensure ES module semantics in Node >= 20
          // Use full path import via createRequire? But dynamic import expects file:// URL
          const fileUrl = `file://${modulePath}`;
          // eslint-disable-next-line no-await-in-loop
          import(fileUrl).then((mod) => {
            const exported = mod.default || mod;
            if (exported && exported.name && typeof exported.execute === 'function') {
              registerAgent(exported);
            } else {
              logger.debug('Agent file did not export agent shape', { file: ent.name });
            }
          }).catch((err) => {
            logger.debug('Failed to import agent file', { file: ent.name, error: err.message });
          });
        } catch (err) {
          logger.debug('Auto-discover agent error', { file: ent.name, error: err.message });
        }
      }
    }
    return listAgents();
  } catch (err) {
    logger.warn('Agent auto-discovery failed', { error: err.message });
    return [];
  }
}

/**
 * Health summary for agents
 */
export function health() {
  const names = listAgents();
  return { count: names.length, agents: names };
}

/**
 * Boot: auto-discover on require
 */
try {
  autoDiscoverAgents();
} catch (e) {
  logger.warn('AgentRegistry startup autoload failed', { error: e.message });
}

export default {
  registerAgent,
  getAgent,
  listAgents,
  autoDiscoverAgents,
  health
};
