// path: /monitoring/healthMonitor.js
/**
 * Health Monitor
 * - Provides lightweight health checks for subsystems
 */

import axios from 'axios';
import logger from '../utils/logger.js';
import config from '../config/index.js';

async function checkMongo(mongoose) {
  try {
    const state = mongoose.connection.readyState;
    return { ok: state === 1, state };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function checkExternal(url) {
  try {
    const r = await axios.get(url, { timeout: 3000 });
    return { ok: true, status: r.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export default { checkMongo, checkExternal };
