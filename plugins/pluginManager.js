// path: /plugins/pluginManager.js
/**
 * Plugin Manager
 * - Coordinates plugin lifecycle (load, enable, disable)
 */

import pluginRegistry from './pluginRegistry.js';
import pluginLoader from './pluginLoader.js';

async function init() {
  await pluginLoader.loadPlugins();
}

function enablePlugin(name) {
  const p = pluginRegistry.getPlugin(name);
  if (p) p.enabled = true;
  return p;
}

function disablePlugin(name) {
  const p = pluginRegistry.getPlugin(name);
  if (p) p.enabled = false;
  return p;
}

export default { init, enablePlugin, disablePlugin };
