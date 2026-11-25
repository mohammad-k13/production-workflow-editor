import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Workflow } from '../../shared/workflow/index.ts';
import { createWorkflowHistory, workflowHistoryReducer } from '../src/workflowHistory.ts';

const base: Workflow = {
  steps: [{ id: 'step', name: 'Original', durationMinutes: 1, position: { x: 0, y: 0 } }],
  connections: [],
};

function rename(name: string) {
  return (workflow: Workflow) => ({
    ...workflow,
    steps: workflow.steps.map((step) => ({ ...step, name })),
  });
}

test('undo restores up to the five latest workflow edits', () => {
  let history = createWorkflowHistory(base);
  for (let edit = 1; edit <= 7; edit++) {
    history = workflowHistoryReducer(history, { type: 'edit', update: rename(`Edit ${edit}`) });
  }
  for (let expected = 6; expected >= 2; expected--) {
    history = workflowHistoryReducer(history, { type: 'undo' });
    assert.equal(history.workflow.steps[0].name, `Edit ${expected}`);
  }
  assert.equal(workflowHistoryReducer(history, { type: 'undo' }), history);
});

test('typing in one field can be undone as a group but a later edit is separate', () => {
  const start = createWorkflowHistory(base);
  const first = workflowHistoryReducer(start, { type: 'edit', group: 'name', update: rename('M') });
  const typed = workflowHistoryReducer(first, { type: 'edit', group: 'name', update: rename('Mill') });
  const finished = workflowHistoryReducer(typed, { type: 'finish-edit' });
  const later = workflowHistoryReducer(finished, { type: 'edit', group: 'name', update: rename('Cut') });

  const previousFieldValue = workflowHistoryReducer(later, { type: 'undo' });
  assert.equal(previousFieldValue.workflow.steps[0].name, 'Mill');
  const original = workflowHistoryReducer(previousFieldValue, { type: 'undo' });
  assert.equal(original.workflow, base);
});

test('replacing the document discards undo history from the previous workflow', () => {
  const loaded = createWorkflowHistory(base);
  const edited = workflowHistoryReducer(loaded, { type: 'edit', update: rename('Edited draft') });
  const replacement: Workflow = { steps: [], connections: [] };
  const replaced = workflowHistoryReducer(edited, { type: 'replace', workflow: replacement });
  const undone = workflowHistoryReducer(replaced, { type: 'undo' });
  assert.equal(undone.workflow, replacement);
  assert.equal(undone, replaced);
});
