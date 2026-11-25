import type { Workflow } from '../../shared/workflow/index.ts';

const HISTORY_LIMIT = 5;

type WorkflowHistory = {
  workflow: Workflow;
  previous: Workflow[];
  editGroup?: string;
};

type HistoryAction =
  | { type: 'edit'; update: (workflow: Workflow) => Workflow; group?: string }
  | { type: 'finish-edit' }
  | { type: 'replace'; workflow: Workflow }
  | { type: 'undo' };

export function createWorkflowHistory(workflow: Workflow): WorkflowHistory {
  return { workflow, previous: [] };
}

export function workflowHistoryReducer(history: WorkflowHistory, action: HistoryAction): WorkflowHistory {
  switch (action.type) {
    case 'edit': {
      const workflow = action.update(history.workflow);
      if (workflow === history.workflow) return history;
      const sameGroup = action.group !== undefined && action.group === history.editGroup;
      return {
        workflow,
        previous: sameGroup
          ? history.previous
          : [...history.previous.slice(1 - HISTORY_LIMIT), history.workflow],
        editGroup: action.group,
      };
    }
    case 'finish-edit':
      return history.editGroup === undefined ? history : { ...history, editGroup: undefined };
    case 'replace':
      return createWorkflowHistory(action.workflow);
    case 'undo': {
      const workflow = history.previous.at(-1);
      return workflow ? { workflow, previous: history.previous.slice(0, -1) } : history;
    }
  }
}
