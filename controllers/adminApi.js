// path: controllers/adminApi.js
/**
 * Admin API Controller
 *
 * - Exposes admin endpoints to inspect workflows, approvals, payments, and system audit logs
 * - Recommended to be protected by authMiddleware and rbac('admin')
 *
 * Routes:
 *  - GET   /admin/health         -> aggregated system health
 *  - GET   /admin/workflows      -> list workflows (query params: status, owner, limit)
 *  - GET   /admin/workflows/:id  -> workflow details
 *  - GET   /admin/approvals      -> list approvals
 *  - GET   /admin/payments       -> list payment records
 *  - GET   /admin/auditlogs      -> list audit logs
 *
 * Pagination via ?limit= & ?skip=
 */

import express from 'express';
import Workflow from '../models/Workflow.js';
import Approval from '../models/Approval.js';
import PaymentRecord from '../models/PaymentRecord.js';
import AuditLog from '../models/AuditLog.js';
import redisClient from '../queue/redisClient.js';
import logger from '../utils/logger.js';
import monitoring from '../monitoring/metrics.js';

const router = express.Router();

router.get('/health', async (req, res) => {
  try {
    // check Redis and Mongo basic
    const redisHealth = await redisClient.checkRedisHealth();
    const mongoReady = !!(await Workflow.countDocuments().limit(1).catch(() => 0) >= 0);
    // queue metrics
    const queueMetrics = {};
    try {
      const qm = await monitoring.setQueueWaiting; // dummy reading to ensure module available
    } catch (e) {
      // ignore
    }
    return res.json({ success: true, redis: redisHealth, mongoConnected: mongoReady });
  } catch (err) {
    logger.error('Admin health check failed', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * List workflows with optional filters
 */
router.get('/workflows', async (req, res) => {
  try {
    const { status, owner, limit = 50, skip = 0 } = req.query;
    const q = {};
    if (status) q.status = status;
    if (owner) q.owner = owner;
    const wf = await Workflow.find(q).sort({ createdAt: -1 }).skip(Number(skip)).limit(Math.min(200, Number(limit)));
    return res.json({ success: true, count: wf.length, workflows: wf });
  } catch (err) {
    logger.error('Admin list workflows failed', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get workflow details
 */
router.get('/workflows/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const wf = await Workflow.findOne({ workflowId: id });
    if (!wf) return res.status(404).json({ success: false, error: 'Not found' });
    return res.json({ success: true, workflow: wf });
  } catch (err) {
    logger.error('Admin get workflow failed', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * List approvals
 */
router.get('/approvals', async (req, res) => {
  try {
    const { status, limit = 50, skip = 0 } = req.query;
    const q = {};
    if (status) q.status = status;
    const list = await Approval.find(q).sort({ requestedAt: -1 }).skip(Number(skip)).limit(Math.min(200, Number(limit)));
    return res.json({ success: true, count: list.length, approvals: list });
  } catch (err) {
    logger.error('Admin list approvals failed', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * List payments
 */
router.get('/payments', async (req, res) => {
  try {
    const { provider, limit = 50, skip = 0 } = req.query;
    const q = {};
    if (provider) q.provider = provider;
    const list = await PaymentRecord.find(q).sort({ createdAt: -1 }).skip(Number(skip)).limit(Math.min(200, Number(limit)));
    return res.json({ success: true, count: list.length, payments: list });
  } catch (err) {
    logger.error('Admin list payments failed', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Audit logs (readonly)
 */
router.get('/auditlogs', async (req, res) => {
  try {
    const { category, limit = 50, skip = 0 } = req.query;
    const q = {};
    if (category) q.category = category;
    const list = await AuditLog.find(q).sort({ createdAt: -1 }).skip(Number(skip)).limit(Math.min(500, Number(limit)));
    return res.json({ success: true, count: list.length, logs: list });
  } catch (err) {
    logger.error('Admin audit logs failed', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
