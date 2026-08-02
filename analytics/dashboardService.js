// path: /analytics/dashboardService.js
/**
 * Dashboard Service
 * - Provides high-level metrics and reports for dashboards
 */

import salesAnalytics from './salesAnalytics.js';
import conversationAnalytics from './conversationAnalytics.js';

async function getSalesSummary(timeframe = 'today') {
  return salesAnalytics.summary(timeframe);
}

async function generateReport(params = {}) {
  return salesAnalytics.generateReport(params);
}

export default { getSalesSummary, generateReport };
