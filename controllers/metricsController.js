// path: controllers/metricsController.js
/**
 * metricsController
 *
 * Exposes /metrics endpoint for Prometheus scraping.
 * Note: Should be mounted unprotected (or protected by network ACL) to allow Prometheus to scrape.
 */

import express from 'express';
import metrics from '../monitoring/metrics.js';
import logger from '../utils/logger.js';

const router = express.Router();

router.get('/metrics', async (req, res) => {
  try {
    const body = await metrics.getMetrics();
    res.set('Content-Type', metrics.registry.contentType || 'text/plain; version=0.0.4; charset=utf-8');
    res.status(200).send(body);
  } catch (err) {
    logger.error('Failed to provide metrics', { error: err.message });
    res.status(500).send(`# error collecting metrics\n# ${err.message}`);
  }
});

export default router;
