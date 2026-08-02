// path: /analytics/salesAnalytics.js
/**
 * Sales Analytics
 * - Aggregates order records to produce metrics
 */

import OrderRecord from '../models/OrderRecord.js';
import logger from '../utils/logger.js';

async function summary(timeframe = 'today') {
  // time-range parsing
  const now = new Date();
  let start = new Date(now);
  if (timeframe === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (timeframe === '7d') {
    start.setDate(start.getDate() - 7);
  }

  const orders = await OrderRecord.find({ createdAt: { $gte: start } }).lean();
  const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);
  return { timeframe, ordersCount: orders.length, totalRevenue };
}

async function createCampaignMetrics(campaign) {
  // placeholder calculation
  logger.info('createCampaignMetrics', { campaign });
  return { campaignId: campaign.id || `c-${Date.now()}`, impressions: 0, clicks: 0 };
}

async function generateReport(params) {
  return summary(params.timeframe || 'today');
}

export default { summary, createCampaignMetrics, generateReport };
