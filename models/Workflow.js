// path: models/Workflow.js
/**
 * Workflow Mongoose model
 *
 * Fields:
 *  - workflowId (string, unique)
 *  - name, owner, correlationId, metadata
 *  - status: pending | running | completed | failed | cancelled
 *  - tasks: array of task objects { id, type, agent, input, status, attempts, result, error, startedAt, finishedAt }
 *  - logs: array of { level, message, meta, ts }
 *
 * Static helpers used by DurableWorkflowEngine:
 *  - createWorkflow({ workflowId, name, owner, correlationId, metadata, tasks })
 *
 * Instance helpers:
 *  - updateTask(taskId, updates)
 *  - appendLog(level, message, meta)
 *  - markCompleted(opts)
 *  - markFailed(opts)
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const TaskSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String },
    agent: { type: String },
    input: { type: Schema.Types.Mixed },
    status: { type: String, enum: ['pending', 'running', 'succeeded', 'failed', 'cancelled'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    result: { type: Schema.Types.Mixed },
    error: { type: Schema.Types.Mixed },
    startedAt: { type: Date },
    finishedAt: { type: Date }
  },
  { _id: false }
);

const LogSchema = new Schema(
  {
    level: { type: String, enum: ['debug', 'info', 'warn', 'error'], default: 'info' },
    message: { type: String },
    meta: { type: Schema.Types.Mixed },
    ts: { type: Date, default: Date.now }
  },
  { _id: false }
);

const WorkflowSchema = new Schema(
  {
    workflowId: { type: String, required: true, unique: true, index: true },
    name: { type: String },
    owner: { type: String },
    correlationId: { type: String, index: true },
    metadata: { type: Schema.Types.Mixed },
    status: { type: String, enum: ['pending', 'running', 'completed', 'failed', 'cancelled'], default: 'pending', index: true },
    tasks: { type: [TaskSchema], default: [] },
    logs: { type: [LogSchema], default: [] },
    startedAt: { type: Date },
    completedAt: { type: Date }
  },
  { timestamps: true }
);

/**
 * Create and persist a workflow document.
 * Accepts tasks as array of { id, type, agent, input }.
 */
WorkflowSchema.statics.createWorkflow = async function ({ workflowId, name, owner, correlationId, metadata = {}, tasks = [] } = {}) {
  if (!workflowId) throw new Error('workflowId required');
  const doc = {
    workflowId,
    name,
    owner,
    correlationId,
    metadata,
    status: 'pending',
    tasks: (tasks || []).map((t) => ({
      id: t.id,
      type: t.type,
      agent: t.agent,
      input: t.input || {},
      status: t.status || 'pending',
      attempts: t.attempts || 0
    }))
  };
  const wf = await this.create(doc);
  // initial log
  await wf.appendLog('info', 'Workflow created', { workflowId, name });
  return wf;
};

/**
 * Update a single task within the workflow by task id.
 * Merges provided updates into the task object.
 */
WorkflowSchema.methods.updateTask = async function (taskId, updates = {}) {
  const idx = this.tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) {
    throw new Error(`Task ${taskId} not found`);
  }
  const task = this.tasks[idx];
  // apply updates shallowly
  Object.assign(task, updates);
  // ensure attempts numeric
  if (typeof updates.attempts === 'number') task.attempts = updates.attempts;
  if (updates.startedAt) task.startedAt = updates.startedAt;
  if (updates.finishedAt) task.finishedAt = updates.finishedAt;
  // persist
  this.markModified('tasks');
  await this.save();
  return task;
};

/**
 * Append a structured log entry to the workflow
 */
WorkflowSchema.methods.appendLog = async function (level = 'info', message = '', meta = {}) {
  const entry = { level, message, meta, ts: new Date() };
  this.logs = this.logs || [];
  this.logs.push(entry);
  // also update timestamps quickly
  this.markModified('logs');
  try {
    // do not await elsewhere to avoid blocking callers too long, but keep to ensure persistence in most flows
    await this.save();
  } catch (err) {
    // swallow error to avoid cascading failures; higher-level code will log
    // but still append to in-memory instance
  }
  return entry;
};

/**
 * Mark workflow completed, set status and completedAt
 */
WorkflowSchema.methods.markCompleted = async function ({ message } = {}) {
  this.status = 'completed';
  this.completedAt = new Date();
  await this.appendLog('info', message || 'Workflow completed', {});
  await this.save();
  return this;
};

/**
 * Mark workflow failed
 */
WorkflowSchema.methods.markFailed = async function ({ reason } = {}) {
  this.status = 'failed';
  this.completedAt = new Date();
  await this.appendLog('error', reason || 'Workflow failed', {});
  await this.save();
  return this;
};

/**
 * Find one helper is the standard mongoose findOne — kept as-is
 */

/**
 * Optional: convenience to find by workflowId
 */
WorkflowSchema.statics.findByWorkflowId = function (workflowId) {
  return this.findOne({ workflowId });
};

const Workflow = mongoose.models.Workflow || mongoose.model('Workflow', WorkflowSchema);
export default Workflow;
