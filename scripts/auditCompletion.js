// path: scripts/auditCompletion.js
/**
 * scripts/auditCompletion.js
 *
 * CI helper that checks for presence of critical files and produces an audit-report.json
 * used by the CI job to assert basic repository completeness.
 *
 * Usage:
 *   node scripts/auditCompletion.js
 *
 * Exits with code 0 on success, non-zero on missing critical files.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function fileExists(rel) {
  try {
    return fs.existsSync(path.resolve(process.cwd(), rel));
  } catch {
    return false;
  }
}

const requiredFiles = [
  'server.js',
  'package.json',
  'queue/redisClient.js',
  'queue/queueManager.js',
  'queue/queueUtils.js',
  'workflows/durableWorkflowEngine.js',
  'models/Workflow.js',
  'workers/taskWorker.js',
  'controllers/workflowController.js',
  'controllers/paymentWebhookController.js',
  'controllers/approvalController.js',
  'controllers/adminApi.js',
  'controllers/whatsappController.js',
  'monitoring/metrics.js',
  'monitoring/otel.js',
  'utils/logger.js',
  'utils/auditLogger.js',
  'logging/shipper.js',
  'docker/Dockerfile.prod',
  'k8s/deployment.yaml',
  '.github/workflows/ci.yml',
  '.github/workflows/cd.yml',
  'scripts/auditCompletion.js', // self
  'tests/unit/queue.test.js',
  'tests/integration/workflow.e2e.test.js'
];

const optionalFiles = [
  'README.md',
  'config/feature-flags.json',
  'config/roles.json'
];

const results = { scannedAt: new Date().toISOString(), required: {}, optional: {}, missingRequired: [] };

for (const f of requiredFiles) {
  const ok = fileExists(f);
  results.required[f] = ok;
  if (!ok) results.missingRequired.push(f);
}

for (const f of optionalFiles) {
  results.optional[f] = fileExists(f);
}

// write audit report
const outPath = path.resolve(process.cwd(), 'audit-report.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
console.log('Audit report written to', outPath);

if (results.missingRequired.length > 0) {
  console.error('Missing required files:', results.missingRequired);
  process.exit(2);
}

console.log('Audit completion check passed.');
process.exit(0);
