// path: utils/circuitBreaker.js
/**
 * circuitBreaker
 *
 * Wrapper around opossum circuit breaker to protect unstable external calls.
 *
 * Exports:
 *  - createCircuitBreaker(fn, options) -> returns breaker instance with .fire(...) method
 *
 * Options (passed to opossum):
 *  - timeout: time in ms to consider action timed out (default 10_000)
 *  - errorThresholdPercentage: percentage of failures to open circuit (default 50)
 *  - resetTimeout: time in ms to attempt to close circuit after open (default 30_000)
 *
 * The returned breaker is instrumented to log state transitions.
 */

import opossum from 'opossum';
import logger from './logger.js';

function createCircuitBreaker(actionFn, opts = {}) {
  if (typeof actionFn !== 'function') throw new Error('createCircuitBreaker requires function');

  const options = {
    timeout: opts.timeout || Number(process.env.CB_TIMEOUT_MS || 10000),
    errorThresholdPercentage: opts.errorThresholdPercentage || Number(process.env.CB_ERROR_THRESHOLD_PERCENTAGE || 50),
    resetTimeout: opts.resetTimeout || Number(process.env.CB_RESET_TIMEOUT_MS || 30000),
    rollingCountTimeout: opts.rollingCountTimeout || 10000,
    rollingCountBuckets: opts.rollingCountBuckets || 10,
    ...opts
  };

  const breaker = new opossum(actionFn, options);

  breaker.on('open', () => logger.warn('circuit-breaker opened', { name: actionFn.name || 'anonymous' }));
  breaker.on('halfOpen', () => logger.info('circuit-breaker halfOpen', { name: actionFn.name || 'anonymous' }));
  breaker.on('close', () => logger.info('circuit-breaker closed', { name: actionFn.name || 'anonymous' }));
  breaker.on('fallback', (result) => logger.warn('circuit-breaker fallback triggered', { name: actionFn.name || 'anonymous', result }));
  breaker.on('reject', (err) => logger.warn('circuit-breaker rejected call', { name: actionFn.name || 'anonymous', error: err && err.message }));
  breaker.on('timeout', (err) => logger.warn('circuit-breaker action timed out', { name: actionFn.name || 'anonymous', error: err && err.message }));
  breaker.on('failure', (err) => logger.debug('circuit-breaker recorded failure', { name: actionFn.name || 'anonymous', error: err && err.message }));

  return breaker;
}

export default { createCircuitBreaker };
