// path: /notifications/smsNotifier.js
/**
 * SMS Notifier - wrapper for SMS provider (Twilio, etc.)
 */

import logger from '../utils/logger.js';

async function send({ to, text }) {
  logger.info('smsNotifier.send called', { to });
  // Implement provider integration here
  return { success: true, to };
}

export default { send };
