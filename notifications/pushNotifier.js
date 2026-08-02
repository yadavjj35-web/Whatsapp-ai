// path: /notifications/pushNotifier.js
/**
 * Push Notifier - for push notifications to apps
 */

import logger from '../utils/logger.js';

async function send({ to, title, body }) {
  logger.info('pushNotifier.send called', { to, title });
  return { success: true };
}

export default { send };
