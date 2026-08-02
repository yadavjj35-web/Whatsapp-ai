// path: /analytics/conversationAnalytics.js
/**
 * Conversation Analytics
 * - Analyze Conversation model for metrics like average response time, message counts
 */

import Conversation from '../models/Conversation.js';

async function getMetrics(timeframe = '7d') {
  // naive implementation: total convos
  const now = new Date();
  let start = new Date();
  if (timeframe === '7d') start.setDate(now.getDate() - 7);
  else start = new Date(0);

  const convos = await Conversation.find({ updatedAt: { $gte: start } }).lean();
  const totalMessages = convos.reduce((s, c) => s + (c.messages?.length || 0), 0);
  return { timeframe, conversations: convos.length, totalMessages };
}

export default { getMetrics };
