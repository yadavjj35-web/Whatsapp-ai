// path: /logging/workflowLogger.js
import logger from '../utils/logger.js';

function log(workflowId, message, meta = {}) {
  logger.info(`WORKFLOW:${workflowId} ${message}`, meta);
}

export default { log };
