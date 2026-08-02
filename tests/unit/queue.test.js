// path: tests/unit/queue.test.js
/**
 * Unit tests for queue/queueUtils.js using Node 20 built-in test runner.
 *
 * Run via: node --test tests/unit/queue.test.js
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';
import { canonicalize, computeHash, generateJobId, defaultJobOptions } from '../../queue/queueUtils.js';

test('canonicalize produces stable ordering', (t) => {
  const a = { b: 2, a: 1, c: { z: 3, y: 4 } };
  const b = { c: { y: 4, z: 3 }, b: 2, a: 1 };
  const ca = canonicalize(a);
  const cb = canonicalize(b);
  assert.equal(typeof ca, 'string');
  assert.equal(ca, cb, 'canonicalize should produce same string for same content with different key order');
});

test('computeHash is deterministic', (t) => {
  const obj = { hello: 'world', x: 1 };
  const h1 = computeHash(obj);
  const h2 = computeHash(obj);
  assert.equal(h1, h2, 'hash must be deterministic');
  assert.equal(typeof h1, 'string');
  assert.ok(h1.length >= 64, 'sha256 hex length expected');
});

test('generateJobId contains job name and stable hash', (t) => {
  const jobName = 'testTask';
  const workflowId = 'wf_123';
  const payload = { foo: 'bar', n: 2 };
  const id1 = generateJobId(jobName, workflowId, payload);
  const id2 = generateJobId(jobName, workflowId, payload);
  assert.equal(id1, id2);
  assert.ok(id1.startsWith('testtask:'), 'prefix should include normalized job name');
});

test('defaultJobOptions returns object with attempts/backoff/timeout', (t) => {
  const opts = defaultJobOptions();
  assert.ok(opts.attempts >= 1, 'attempts should be >= 1');
  assert.ok(opts.backoff && opts.backoff.type, 'backoff config expected');
  assert.ok(typeof opts.timeout === 'number' && opts.timeout > 0, 'timeout must be positive number');
});
