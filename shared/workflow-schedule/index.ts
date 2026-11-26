import type { Workflow } from '../workflow/index.ts';
import { topologicallyOrderStepIds } from '../workflow-graph/index.ts';
import { validateWorkflow, type WorkflowValidationIssue } from '../workflow-validation/index.ts';

export type StepTiming = {
  earliestStartMinutes: number;
  earliestFinishMinutes: number;
};

export type WorkflowSchedule = {
  totalDurationMinutes: number;
  stepTimings: Record<string, StepTiming>;
  startingStepIds: string[];
  criticalPathStepIds: string[];
  criticalPathConnectionIds: string[];
};

export class InvalidWorkflowError extends Error {
  readonly issues: WorkflowValidationIssue[];

  constructor(issues: WorkflowValidationIssue[]) {
    super('Cannot calculate a schedule for an invalid workflow.');
    this.name = 'InvalidWorkflowError';
    this.issues = issues;
  }
}

/** Calculate earliest timings and one deterministic critical path for a valid DAG. */
export function calculateSchedule(workflow: Workflow): WorkflowSchedule {
  const validation = validateWorkflow(workflow);
  if (!validation.valid) {
    throw new InvalidWorkflowError(validation.issues);
  }

  const topologicalOrder = topologicallyOrderStepIds(
    workflow.steps.map((step) => step.id),
    workflow.connections,
  );
  if (topologicalOrder.hasCycle) {
    // This is defensive: validation and scheduling share the same graph helper.
    throw new InvalidWorkflowError([
      {
        code: 'workflow_cycle',
        path: 'connections',
        message: 'Workflow dependencies must not contain a cycle.',
      },
    ]);
  }

  const stepsById = new Map(workflow.steps.map((step) => [step.id, step]));
  const incomingConnections = new Map<string, Workflow['connections']>(
    workflow.steps.map((step) => [step.id, []]),
  );
  for (const connection of workflow.connections) {
    incomingConnections.get(connection.toStepId)?.push(connection);
  }

  const finishTimes = new Map<string, number>();
  const predecessorByStepId = new Map<
    string,
    { stepId: string; connectionId: string }
  >();
  const timingEntries: Array<[string, StepTiming]> = [];

  for (const stepId of topologicalOrder.stepIds) {
    const step = stepsById.get(stepId);
    if (!step) {
      continue;
    }

    let earliestStartMinutes = 0;
    for (const connection of incomingConnections.get(stepId) ?? []) {
      const predecessorFinish = finishTimes.get(connection.fromStepId) ?? 0;
      if (predecessorFinish > earliestStartMinutes) {
        earliestStartMinutes = predecessorFinish;
        predecessorByStepId.set(stepId, {
          stepId: connection.fromStepId,
          connectionId: connection.id,
        });
      }
    }

    const earliestFinishMinutes = earliestStartMinutes + step.durationMinutes;
    finishTimes.set(stepId, earliestFinishMinutes);
    timingEntries.push([
      stepId,
      { earliestStartMinutes, earliestFinishMinutes },
    ]);
  }

  const startingStepIds = workflow.steps
    .filter((step) => (incomingConnections.get(step.id)?.length ?? 0) === 0)
    .map((step) => step.id);

  let totalDurationMinutes = 0;
  let criticalEndStepId: string | undefined;
  for (const step of workflow.steps) {
    const finish = finishTimes.get(step.id) ?? 0;
    if (finish > totalDurationMinutes) {
      totalDurationMinutes = finish;
      criticalEndStepId = step.id;
    }
  }

  const criticalPathStepIds: string[] = [];
  const criticalPathConnectionIds: string[] = [];
  let pathStepId = criticalEndStepId;
  while (pathStepId !== undefined) {
    criticalPathStepIds.unshift(pathStepId);
    const predecessor = predecessorByStepId.get(pathStepId);
    if (!predecessor) {
      break;
    }
    criticalPathConnectionIds.unshift(predecessor.connectionId);
    pathStepId = predecessor.stepId;
  }

  return {
    totalDurationMinutes,
    stepTimings: Object.fromEntries(timingEntries),
    startingStepIds,
    criticalPathStepIds,
    criticalPathConnectionIds,
  };
}
