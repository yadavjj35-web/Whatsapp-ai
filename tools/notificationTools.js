// path: /tools/notificationTools.js
/**
 * Notification Tools wrapper
 */

import notificationManager from '../notifications/notificationManager.js';

export default {
  whatsapp: notificationManager.whatsappNotifier.send,
  email: notificationManager.emailNotifier.send,
  sms: notificationManager.smsNotifier.send,
  push: notificationManager.pushNotifier.send,
  notifyOwner: notificationManager.notificationManager.notifyOwner
};
