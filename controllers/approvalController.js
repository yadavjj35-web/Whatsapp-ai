// path: controllers/approvalController.js
/**
 * Approval Controller
 *
 * Routes:
 *  - POST  /api/v1/approvals            -> create an approval request
 *  - GET   /api/v1/approvals/:id        -> get approval status
 *  - POST  /api/v1/approvals/:id/decide -> approve/reject (requires auth)
 *  - GET   /api/v1/approvals/accept     -> signed link acceptance (signed query params)
 *
 * Notes:
 *  - Signed link flow: emails/whatsapp can include a signed approval link pointing to /api/v1/approvals/accept?token=...
 *  - The accept endpoint verifies token via utils/urlSigner and then records the decision.
 *
 * Security:
 *  - The decide endpoint expects req.user to be populated by auth middleware (OIDC/passport)
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import Approval from '../models/Approval.js';
import Workflow from '../models/Workflow.js';
import approvalNotifier from '../services/approvalNotifier.js';
import urlSigner from '../utils/urlSigner.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * Create approval request
 * Body:
 *  {
 *    workflowId,
 *    taskId,
 *    requestedBy,
 *    channel: 'email'|'whatsapp'|'ui',
 *    approverContact: { email, phone },
 *    expiresInSeconds: 86400,
 *    metadata: {}
 *  }
 */
router.post('/', async (req, res, next) => {
  try {
    const { workflowId, taskId, requestedBy, channel = 'ui', approverContact = {}, expiresInSeconds = 24 * 3600, metadata = {} } = req.body;
    if (!workflowId && !metadata) return res.status(400).json({ success: false, error: 'workflowId or metadata required' });

    const approvalId = `app_${Date.now()}_${uuidv4()}`;
    const expiresAt = new Date(Date.now() + Number(expiresInSeconds) * 1000);

    const signedToken = urlSigner.sign({ approvalId, workflowId, taskId }, { expiresInSeconds });

    const approval = await Approval.create({
      approvalId,
      workflowId,
      taskId,
      status: 'pending',
      requestedBy,
      requestedAt: new Date(),
      expiresAt,
      channel,
      signedTokenId: signedToken.id || null,
      metadata
    });

    // Send notification using approvalNotifier
    try {
      await approvalNotifier.notifyApprovalRequest({
        approvalId,
        workflowId,
        taskId,
        channel,
        approverContact,
        signedUrl: signedToken.url,
        metadata
      });
    } catch (err) {
      logger.warn('Failed to send approval notification', { approvalId, error: err.message });
      // do not fail creation; notification can be retried
      approval.notificationMeta = { sent: false, error: err.message };
      await approval.save();
    }

    // Append log to workflow if present
    if (workflowId) {
      try {
        const wf = await Workflow.findOne({ workflowId });
        if (wf) {
          await wf.appendLog('info', 'Approval requested', { approvalId, taskId });
        }
      } catch (err) {
        // ignore
      }
    }

    return res.status(201).json({ success: true, approvalId, signedUrl: signedToken.url });
  } catch (err) {
    logger.error('Create approval failed', { error: err.message });
    return next(err);
  }
});

/**
 * Get approval status
 */
router.get('/:id', async (req, res, next) => {
  try {
    const approvalId = req.params.id;
    const app = await Approval.findOne({ approvalId }).lean();
    if (!app) return res.status(404).json({ success: false, error: 'Not found' });
    return res.json({ success: true, approval: app });
  } catch (err) {
    logger.error('Get approval failed', { error: err.message });
    return next(err);
  }
});

/**
 * Decide approval (approve/reject) — requires authentication and role check
 * Body: { decision: 'approved'|'rejected', notes }
 */
router.post('/:id/decide', async (req, res, next) => {
  try {
    const approvalId = req.params.id;
    const { decision, notes } = req.body;
    const user = req.user?.sub || req.user?.email || 'unknown';
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ success: false, error: 'Invalid decision' });

    const app = await Approval.findOne({ approvalId });
    if (!app) return res.status(404).json({ success: false, error: 'Not found' });
    if (app.status !== 'pending') return res.status(409).json({ success: false, error: 'Approval not pending' });

    app.status = decision === 'approved' ? 'approved' : 'rejected';
    app.approver = user;
    app.decision = notes || '';
    app.decidedAt = new Date();
    await app.save();

    // Append workflow log
    if (app.workflowId) {
      try {
        const wf = await Workflow.findOne({ workflowId: app.workflowId });
        if (wf) {
          await wf.appendLog('info', 'Approval decided', { approvalId, decision: app.status, approver: user });
        }
      } catch (err) {
        // ignore
      }
    }

    return res.json({ success: true, approvalId, status: app.status });
  } catch (err) {
    logger.error('Decide approval error', { error: err.message });
    return next(err);
  }
});

/**
 * Signed link accept endpoint (GET)
 * Query: token=<signed-token>&decision=approved|rejected
 *
 * Verifies token using urlSigner and records decision.
 */
router.get('/accept', async (req, res, next) => {
  try {
    const token = req.query.token;
    const decision = (req.query.decision || 'approved').toLowerCase();
    if (!token) return res.status(400).send('Missing token');
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).send('Invalid decision');

    // Verify token and extract payload
    const payload = urlSigner.verify(token);
    if (!payload || !payload.approvalId) return res.status(400).send('Invalid or expired token');

    const approvalId = payload.approvalId;
    const app = await Approval.findOne({ approvalId });
    if (!app) return res.status(404).send('Approval not found');

    if (app.status !== 'pending') {
      return res.status(409).send(`Approval not pending (current status: ${app.status})`);
    }

    app.status = decision === 'approved' ? 'approved' : 'rejected';
    app.approver = payload.approver || 'link-user';
    app.decision = payload.notes || `via signed link (${decision})`;
    app.decidedAt = new Date();
    await app.save();

    // Append log on workflow
    if (app.workflowId) {
      try {
        const wf = await Workflow.findOne({ workflowId: app.workflowId });
        if (wf) {
          await wf.appendLog('info', 'Approval decided via signed link', { approvalId, decision, approver: app.approver });
        }
      } catch (err) {
        // ignore
      }
    }

    // Respond with friendly HTML or JSON depending on Accept header
    if ((req.headers.accept || '').includes('text/html')) {
      return res.send(`<html><body><h1>Decision recorded</h1><p>Approval ${approvalId} marked as ${app.status}.</p></body></html>`);
    }
    return res.json({ success: true, approvalId, status: app.status });
  } catch (err) {
    logger.error('Signed approval accept error', { error: err.message });
    return next(err);
  }
});

export default router;
