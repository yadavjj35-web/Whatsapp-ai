// path: /notifications/emailNotifier.js
/**
 * Email Notifier - basic SMTP or external provider integration
 * For production, integrate with SendGrid/Postmark/SES
 */

import axios from 'axios';
import logger from '../utils/logger.js';

const PROVIDER = process.env.EMAIL_PROVIDER || '';

async function send({ to, subject, html }) {
  // If provider is not configured, throw
  if (!PROVIDER) {
    logger.warn('Email provider not configured');
    return { success: false, error: 'Email provider not configured' };
  }
  // Example: integrate with a generic HTTP provider
  // This is intentionally generic; replace with provider's SDK
  const resp = await axios.post(PROVIDER, { to, subject, html }, { timeout: 10000 }).catch((err) => {
    logger.error('emailNotifier send error', err.message);
    throw err;
  });
  return resp.data;
}

export default { send };
