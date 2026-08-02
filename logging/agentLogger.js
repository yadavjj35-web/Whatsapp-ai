// path: /logging/agentLogger.js
import logger from '../utils/logger.js';

function logAgent(agentName, level, message, meta = {}) {
  logger.log({ level, message: `${agentName}: ${message}`, metadata: meta });
}

export default { logAgent };
