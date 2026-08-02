// path: /plugins/pluginRegistry.js
/**
 * Plugin Registry
 * - Registry for plugins to register capabilities and hooks
 */

const registry = {
  plugins: new Map()
};

function registerPlugin(name, manifest) {
  if (!name || !manifest) throw new Error('Invalid plugin registration');
  registry.plugins.set(name, manifest);
  return true;
}

function getPlugin(name) {
  return registry.plugins.get(name);
}

function listPlugins() {
  return Array.from(registry.plugins.keys());
}

export default { registerPlugin, getPlugin, listPlugins, registry };
