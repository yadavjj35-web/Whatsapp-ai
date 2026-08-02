// path: /tools/analyticsTools.js
/**
 * Analytics Tools wrapper around /analytics services
 */

import dashboardService from '../analytics/dashboardService.js';
import salesAnalytics from '../analytics/salesAnalytics.js';
import conversationAnalytics from '../analytics/conversationAnalytics.js';

export default {
  getSalesSummary: dashboardService.getSalesSummary,
  generateReport: dashboardService.generateReport,
  getConversationMetrics: conversationAnalytics.getMetrics,
  createCampaignMetrics: salesAnalytics.createCampaignMetrics
};
