// path: controllers/workflowController.js
/**
 * Workflow Controller
 *
 * Express handlers for workflow management:
 *  - POST /api/v1/workflows         -> create workflow
 *  - POST /api/v1/workflows/:id/start  -> start workflow
 *  - GET  /api/v1/workflows/:id     -> get workflow status
 *  - POST /api/v1/workflows/:id/retry-task -> retry a specific task
 *  - POST /api/v1/workflows/:id/cancel -> cancel workflow
 *
 * These handlers are intended to be mounted under existing routes (routes/api.js).
 * They perform basic validation and rely on DurableWorkflowEngine for core logic.
 *
 * Note: RBAC / auth should be applied at route layer (middleware) by the router using middleware/rbac.js or auth middleware.
 */

import express from 'express';
import engine from '../workflows/durableWorkflowEngine.js';
import Workflow from '../models/Workflow.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

/**
 * Create workflow
 * Request body:
 * {
 *  "name": "Daily sales report",
 *  "owner": "owner@example.com",
 *  "correlationId": "...",
 *  "metadata": {...},
 *  "tasks": [{ type, agent, input }]
 * }
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, owner, correlationId, metadata, tasks = [], startImmediately = true } = req.body;
    const workflowId = `wf_${Date.now()}_${uuidv4()}`;
    const wf = await engine.createWorkflow({ workflowId, name, owner, correlationId, metadata, tasks, startImmediately });
    return res.status(201).json({ success: true, workflowId: wf.workflowId, status: wf.status });
  } catch (err) {
    logger.error('Failed to create workflow', { error: err.message });
    return next(err);
  }
});

/**
 * Start a workflow (enqueue pending tasks)
 */
router.post('/:id/start', async (req, res, next) => {
  try {
    const workflowId = req.params.id;
    const wf = await engine.startWorkflow(workflowId);
    return res.json({ success: true, workflowId: wf.workflowId, status: wf.status });
  } catch (err) {
    logger.error('Failed to start workflow', { error: err.message });
    return next(err);
  }
});

/**
 * Get workflow status
 */
router.get('/:id', async (req, res, next) => {
  try {
    const workflowId = req.params.id;
    const wf = await Workflow.findOne({ workflowId }).lean();
    if (!wf) return res.status(404).json({ success: false, error: 'Not found' });
    return res.json({ success: true, workflow: wf });
  } catch (err) {
    logger.error('Failed to fetch workflow', { error: err.message });
    return next(err);
  }
});

/**
 * Retry a specific task within the workflow
 * Body: { taskId: '...' }
 */
router.post('/:id/retry-task', async (req, res, next) => {
  try {
    const workflowId = req.params.id;
    const { taskId } = req.body;
    if (!taskId) return res.status(400).json({ success: false, error: 'Missing taskId' });
    const wf = await engine.retryTask(workflowId, taskId);
    return res.json({ success: true, workflowId: wf.workflowId });
  } catch (err) {
    logger.error('Failed to retry task', { error: err.message });
    return next(err);
  }
});

/**
 * Cancel workflow
 */
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const workflowId = req.params.id;
    const { reason } = req.body;
    const wf = await engine.cancelWorkflow(workflowId, reason || 'cancelled by request');
    return res.json({ success: true, workflowId: wf.workflowId, status: wf.status });
  } catch (err) {
    logger.error('Failed to cancel workflow', { error: err.message });
    return next(err);
  }
});

export default router;
