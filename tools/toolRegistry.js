// path: tools/toolRegistry.js
/**
 * Tool Registry and Context Factory
 *
 * - Maintain registry of available tools (CRM, payment, woo, amazon, n8n, etc.)
 * - createToolContext({ agentName, caller, permissions }) returns an object exposing allowed tools
 * - Tools should be registered with a factory function that produces the tool client
 */

import logger from '../utils/logger.js';

const toolFactories = new Map();

/**
 * Register a tool factory
 * - name: canonical tool name
 * - factory: () => tool client object (or async factory)
 * - options: metadata (permissions, sensitive)
 */
export function registerTool(name, factory, options = {}) {
  if (!name || typeof factory !== 'function') throw new Error('registerTool requires name and factory function');
  toolFactories.set(name, { factory, options });
  logger.info('Tool registered', { name, options });
}

/**
 * Get registered tool factory metadata
 */
export function listTools() {
  return Array.from(toolFactories.keys());
}

/**
 * Create a tool context for an agent. The context exposes get(name) and a shallow mapping of factories executed.
 * - We enforce a permission check here (simple; integrate with RBAC in your app)
 */
export async function createToolContext({ agentName = 'unknown', caller = null, permissions = [] } = {}) {
  const ctx = { agentName, caller, createdAt: new Date() };
  const tools = {};
  for (const [name, meta] of toolFactories.entries()) {
    try {
      // Basic permission check: if tool has requiredPermission and caller lacks it, skip
      const required = meta.options?.requiredPermission;
      if (required && (!permissions || !permissions.includes(required))) {
        logger.debug('Tool permission insufficient', { agentName, tool: name, required });
        continue;
      }
      const client = await meta.factory({ agentName, caller });
      tools[name] = client;
    } catch (err) {
      logger.warn('Failed to initialize tool', { tool: name, error: err.message });
    }
  }

  return {
    meta: ctx,
    tools,
    get: (name) => tools[name] || null
  };
}

/**
 * Helper to bootstrap common tools if present (attempt safe imports)
 * This does best-effort registration; missing modules are skipped
 */
async function bootstrapCommonTools() {
  // Examples: amazonTools, paymentTools, wooTools, crmTools, n8nTools
  const candidates = [
    { name: 'amazon', path: '../tools/amazonTools.js' },
    { name: 'payment', path: '../tools/paymentTools.js' },
    { name: 'woo', path: '../tools/wooTools.js' },
    { name: 'crm', path: '../tools/crmTools.js' },
    { name: 'n8n', path: '../tools/n8nTools.js' }
  ];
  for (const c of candidates) {
    try {
      const mod = await import(c.path);
      const factory = mod.default?.create || mod.create || (() => mod.default || mod);
      registerTool(c.name, factory, { requiredPermission: mod.default?.requiredPermission || null });
    } catch (err) {
      logger.debug('Optional tool not available', { tool: c.name });
    }
  }
}

// Auto bootstrap on load (best-effort)
bootstrapCommonTools().catch(() => { /* ignore */ });

export default {
  registerTool,
  listTools,
  createToolContext
};
