// path: /logging/performanceLogger.js
import logger from '../utils/logger.js';

function metric(name, value, meta = {}) {
  logger.info(`PERF:${name}`, { value, ...meta });
}

export default { metric };
