// path: tests/integration/workflow.e2e.test.js
/**
 * Integration-style test (fast) for DurableWorkflowEngine.createWorkflow/startWorkflow.
 *
 * This test avoids external dependencies by monkey-patching the Workflow model and queueManager.enqueueTask.
 * Run with: node --test tests/integration/workflow.e2e.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import engine from '../../workflows/durableWorkflowEngine.js';
import Workflow from '../../models/Workflow.js';
import queueManager from '../../queue/queueManager.js';

test('DurableWorkflowEngine should persist workflow and enqueue pending tasks', async (t) => {
  // Backup originals
  const origCreate = Workflow.createWorkflow;
  const origFindOne = Workflow.findOne;
  const origAppendLog = Workflow.addLog || null;
  const origEnqueue = queueManager.enqueueTask;

  try {
    // In-memory fake workflow object
    let internalWorkflow = {
      workflowId: 'wf-test-1',
      name: 'test-workflow',
      owner: 'tester',
      status: 'pending',
      tasks: [],
      logs: [],
      startedAt: null,
      completedAt: null,
      async save() {
        return this;
      },
      async appendLog(level, message, meta = {}) {
        this.logs.push({ level, message, meta, timestamp: new Date() });
        return this;
      },
      async updateTask(taskId, update = {}) {
        const t = this.tasks.find((x) => x.id === taskId);
        if (!t) throw new Error('task not found');
        Object.assign(t, update);
        return t;
      },
      async markCompleted() {
        this.status = 'completed';
        this.completedAt = new Date();
        await this.appendLog('info', 'Workflow completed', {});
        return this;
      }
    };

    // stub createWorkflow to return our in-memory object
    Workflow.createWorkflow = async function ({ workflowId, name, owner, correlationId, metadata, tasks = [] } = {}) {
      internalWorkflow.workflowId = workflowId;
      internalWorkflow.name = name;
      internalWorkflow.owner = owner;
      internalWorkflow.tasks = (tasks || []).map((t) => ({
        id: t.id,
        type: t.type,
        agent: t.agent,
        input: t.input || {},
        status: t.status || 'pending',
        attempts: t.attempts || 0
      }));
      internalWorkflow.status = 'pending';
      await internalWorkflow.appendLog('info', 'Workflow created (fake)', { workflowId });
      return internalWorkflow;
    };

    Workflow.findOne = async function (query = {}) {
      if (query && query.workflowId && query.workflowId === internalWorkflow.workflowId) return internalWorkflow;
      // simple match for test
      return null;
    };

    // capture enqueued jobs
    const enqueued = [];
    queueManager.enqueueTask = async function (taskData = {}, opts = {}) {
      enqueued.push({ taskData, opts });
      // return simulated jobId
      return { jobId: `job-${taskData.id || 'x'}`, queueName: opts.queueName || process.env.QUEUE_NAME_TASKS || 'tasks' };
    };

    // Now create a workflow with two tasks
    const wfId = 'wf-test-1';
    const tasks = [
      { id: 't1', type: 'send-message', agent: 'TestAgent', input: { text: 'hello' } },
      { id: 't2', type: 'update-order', agent: 'OrderAgent', input: { orderId: 'ord-1' } }
    ];
    const created = await engine.createWorkflow({ workflowId: wfId, name: 'Integration test workflow', owner: 'tester', tasks, startImmediately: false });

    assert.equal(created.workflowId, wfId, 'workflow created with expected id');
    assert.equal(created.tasks.length, 2, 'workflow has two tasks');

    // Start workflow: should enqueue pending tasks
    const startedWf = await engine.startWorkflow(wfId);
    // queueManager.enqueueTask is stubbed to push into enqueued array
    assert.equal(enqueued.length, 2, 'two tasks enqueued');

    // verify enqueued payloads contain workflowId and correct task ids
    const enqueuedIds = enqueued.map((e) => e.taskData.id);
    assert.deepEqual(enqueuedIds.sort(), ['t1', 't2'].sort(), 'enqueued tasks match workflow tasks');

    // simulate marking first task succeeded via workflow.updateTask
    await internalWorkflow.updateTask('t1', { status: 'succeeded', result: { ok: true }, finishedAt: new Date() });

    // run checkAndFinalize — since one task still pending, workflow should remain running
    const postCheck = await engine.checkAndFinalize(wfId);
    assert.equal(postCheck.status, 'running', 'workflow remains running with pending tasks');

    // mark second task succeeded
    await internalWorkflow.updateTask('t2', { status: 'succeeded', result: { ok: true }, finishedAt: new Date() });

    // run checkAndFinalize again — should mark completed
    const finalized = await engine.checkAndFinalize(wfId);
    assert.equal(finalized.status, 'completed', 'workflow finalized as completed');

  } finally {
    // restore originals
    if (origCreate) Workflow.createWorkflow = origCreate;
    if (origFindOne) Workflow.findOne = origFindOne;
    if (origEnqueue) queueManager.enqueueTask = origEnqueue;
    if (origAppendLog && typeof Workflow.addLog === 'function') Workflow.addLog = origAppendLog;
  }
});
