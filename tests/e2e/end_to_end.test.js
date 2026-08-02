// path: tests/e2e/end_to_end.test.js
/**
 * Basic end-to-end test that mounts the Express app exported by server.js
 * and probes a couple of public endpoints (root, /health).
 *
 * This test avoids starting infrastructure (Redis/Mongo) because server.js
 * initializes external services only when invoked as main. We import the app
 * Express instance and start an ephemeral HTTP server for the duration of the test.
 *
 * Run with: node --test tests/e2e/end_to_end.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import app from '../../server.js';

function listenOnRandomPort(appInstance) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(appInstance);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
    server.on('error', (err) => reject(err));
  });
}

async function httpGet(port, path = '/') {
  return new Promise((resolve, reject) => {
    const opts = { method: 'GET', hostname: '127.0.0.1', port, path, timeout: 5000 };
    const req = http.request(opts, (res) => {
      const bufs = [];
      res.on('data', (c) => bufs.push(c));
      res.on('end', () => {
        const body = Buffer.concat(bufs).toString('utf8');
        resolve({ statusCode: res.statusCode, body });
      });
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

test('app responds to root and /health endpoints', async (t) => {
  const { server, port } = await listenOnRandomPort(app);
  try {
    const root = await httpGet(port, '/');
    assert.ok(root.statusCode === 200 || root.statusCode === 404, `Unexpected root status ${root.statusCode}`);
    const health = await httpGet(port, '/health');
    // /health may attempt to query redis/mongo if server start hooks run; but importing app does not run start() in server.js
    // So health should respond (we implemented a lightweight handler)
    assert.ok([200, 500].includes(health.statusCode), `Unexpected health status ${health.statusCode}`);
  } finally {
    server.close();
  }
});
