// path: /monitoring/systemMetrics.js
/**
 * System Metrics - CPU, Memory, Event loop lag
 */

import os from 'os';

function getMemory() {
  return { total: os.totalmem(), free: os.freemem(), usage: process.memoryUsage() };
}

function getCpu() {
  return { loadavg: os.loadavg(), cpus: os.cpus().length };
}

export default { getMemory, getCpu };
