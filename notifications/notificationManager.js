// path: /notifications/notificationManager.js
/**
 * Notification Manager
 * - Centralized manager that exposes sub-notifiers and shared facilities
 */

import whatsappNotifier from './whatsappNotifier.js';
import emailNotifier from './emailNotifier.js';
import smsNotifier from './smsNotifier.js';
import pushNotifier from './pushNotifier.js';
import logger from '../utils/logger.js';

async function notifyOwner({ subject, body }) {
  // Notify owner via configured channels
  logger.info('notifyOwner invoked', { subject });
  // Minimal: send whatsapp to OWNER_PHONE if configured
  const ownerPhone = process.env.OWNER_PHONE;
  if (ownerPhone) {
    await whatsappNotifier.send({ to: ownerPhone, text: `${subject}\n\n${body}` }).catch(() => null);
  }
  // Also send email if configured
  const ownerEmail = process.env.OWNER_EMAIL;
  if (ownerEmail) {
    await emailNotifier.send({ to: ownerEmail, subject, html: `<p>${body}</p>` }).catch(() => null);
  }
  return { success: true };
}

export default {
  notificationManager: { notifyOwner },
  whatsappNotifier,
  emailNotifier,
  smsNotifier,
  pushNotifier
};
