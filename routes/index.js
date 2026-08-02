// path: routes/index.js
/**
 * Central router index
 *
 * - Centralizes mounting of all API controllers and middleware
 * - Keeps server.js concise and delegates route composition here
 */

import express from 'express';
import workflowController from '../controllers/workflowController.js';
import approvalController from '../controllers/approvalController.js';
import paymentWebhookController from '../controllers/paymentWebhookController.js';
import adminApi from '../controllers/adminApi.js';
import metricsController from '../controllers/metricsController.js';
import whatsappController from '../controllers/whatsappController.js';
import { authMiddleware } from '../auth/oidcClient.js';
import rbac from '../middleware/rbac.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Public endpoints
router.use('/webhooks/payments', paymentWebhookController); // payment webhooks
router.use('/webhooks/whatsapp', whatsappController); // whatsapp webhooks

// API endpoints
router.use('/workflows', workflowController);
router.use('/approvals', approvalController);

// Admin (protected)
router.use('/admin', authMiddleware(), rbac('admin'), adminApi);

// Metrics
router.use('/', metricsController);

// Simple root health page (can be replaced by /health in server.js)
router.get('/', (req, res) => res.json({ ok: true, service: process.env.SERVICE_NAME || 'whatsapp-ai' }));

export default router;
