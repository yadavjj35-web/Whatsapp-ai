// path: services/approvalNotifier.js
/**
 * approvalNotifier.js
 *
 * Sends approval requests to approvers via email or WhatsApp.
 * - notifyApprovalRequest({ approvalId, workflowId, taskId, channel, approverContact, signedUrl, metadata })
 *
 * Integrates with:
 *  - notifications/emailNotifier.js (existing)
 *  - notifications/whatsappNotifier.js (existing)
 *
 * Behavior:
 *  - Attempts best-effort delivery with retries
 *  - Returns delivery metadata for persistence in Approval.notificationMeta
 */

import emailNotifier from '../notifications/emailNotifier.js';
import whatsappNotifier from '../notifications/whatsappNotifier.js';
import retryWrapper from '../utils/retryWrapper.js';
import logger from '../utils/logger.js';

async function notifyApprovalRequest({ approvalId, workflowId, taskId, channel = 'email', approverContact = {}, signedUrl, metadata = {} } = {}) {
  if (!approvalId) throw new Error('approvalId required');
  if (!signedUrl) throw new Error('signedUrl required');

  const body = {
    approvalId,
    workflowId,
    taskId,
    signedUrl,
    metadata
  };

  if (channel === 'whatsapp') {
    const phone = approverContact.phone;
    if (!phone) throw new Error('approverContact.phone required for whatsapp');
    const message = `You have a pending approval request for workflow ${workflowId}. Please approve or reject using the link: ${signedUrl}`;
    const fn = async () => {
      const resp = await whatsappNotifier.sendTextMessage({ to: phone, text: message });
      return resp;
    };
    const resp = await retryWrapper(fn, { attempts: 3, baseDelayMs: 500 });
    logger.info('Approval notification sent via whatsapp', { approvalId, phone });
    return { sentVia: 'whatsapp', result: resp };
  }

  // default: email
  const email = approverContact.email;
  if (!email) throw new Error('approverContact.email required for email channel');
  const subject = `Approval request: ${metadata.title || 'Action requires approval'}`;
  const html = `<p>Hello,</p>
  <p>You have an approval request for workflow <b>${workflowId}</b>.</p>
  <p>Click here to review and approve: <a href="${signedUrl}">${signedUrl}</a></p>
  <p>Task: ${taskId || 'N/A'}</p>
  <p>Thanks.</p>`;

  const fnEmail = async () => {
    const r = await emailNotifier.sendEmail({ to: email, subject, html, text: `Please review: ${signedUrl}` });
    return r;
  };

  const result = await retryWrapper(fnEmail, { attempts: 3, baseDelayMs: 500 });
  logger.info('Approval notification sent via email', { approvalId, to: email });
  return { sentVia: 'email', result };
}

export default { notifyApprovalRequest };
