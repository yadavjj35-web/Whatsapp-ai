// path: routes/index.js
import express from 'express';
import healthController from '../controllers/healthController.js';
import webhookRouter from './webhook.js';
import apiRouter from './api.js';

const router = express.Router();

router.get('/health', healthController);

// WhatsApp webhook
router.use('/webhook', webhookRouter);

// API routes under /api/v1/*
router.use('/', apiRouter);

export default router;
