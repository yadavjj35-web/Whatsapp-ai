// path: /engine/executionQueue.js
/**
 * Execution Queue - simple concurrency-limited queue
 */

import EventEmitter from 'events';

class ExecutionQueue extends EventEmitter {
  constructor(concurrency = 4) {
    super();
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  async enqueue(fn) {
    return new Promise((resolve, reject) => {
      const job = async () => {
        try {
          this.running++;
          const res = await fn();
          resolve(res);
        } catch (err) {
          reject(err);
        } finally {
          this.running--;
          this.next();
        }
      };
      this.queue.push(job);
      process.nextTick(() => this.next());
    });
  }

  next() {
    if (this.running >= this.concurrency) return;
    const job = this.queue.shift();
    if (!job) return;
    job();
  }
}

const executionQueue = new ExecutionQueue(parseInt(process.env.EXECUTION_CONCURRENCY || '4', 10));
export default executionQueue;
