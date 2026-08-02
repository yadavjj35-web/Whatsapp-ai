// path: /plugins/pluginLoader.js
/**
 * Plugin Loader
 * - Dynamically loads plugin modules from /plugins directory
 * - Plugins must expose register(pluginManager) method
 */

import fs from 'fs';
import path from 'path';
import pluginRegistry from './pluginRegistry.js';
import logger from '../utils/logger.js';

async function loadPlugins() {
  const pluginsDir = path.resolve(process.cwd(), 'plugins');
  if (!fs.existsSync(pluginsDir)) return [];
  const files = fs.readdirSync(pluginsDir).filter((f) => f.endsWith('.js'));
  const loaded = [];
  for (const file of files) {
    try {
      const mod = await import(path.join(pluginsDir, file));
      if (mod && typeof mod.register === 'function') {
        mod.register(pluginRegistry);
        loaded.push(file);
        logger.info('Plugin loaded', { file });
      }
    } catch (err) {
      logger.error('Failed to load plugin', { file, error: err.message });
    }
  }
  return loaded;
}

export default { loadPlugins };
