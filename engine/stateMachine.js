// path: /engine/stateMachine.js
/**
 * Simple state machine for workflow tasks
 */

const states = new Map(); // workflowId -> {taskId: state}

function initialize(workflow) {
  const map = {};
  for (const t of workflow.tasks) map[t.id] = 'pending';
  states.set(workflow.id, map);
}

function transition(taskId, state) {
  for (const [wfId, tasks] of states.entries()) {
    if (tasks[taskId] !== undefined) {
      tasks[taskId] = state;
      return true;
    }
  }
  return false;
}

function getState(workflowId, taskId) {
  const wf = states.get(workflowId);
  return wf ? wf[taskId] : undefined;
}

export default { initialize, transition, getState };
