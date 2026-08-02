// path: /notifications/whatsappNotifier.js
/**
 * WhatsApp Notifier - wraps existing services/whatsappService.js
 */

import whatsappService from '../services/whatsappService.js';

async function send({ to, text }) {
  return whatsappService.sendTextMessage(to, text);
}

export default { send };
