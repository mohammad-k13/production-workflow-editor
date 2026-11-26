import assert from 'node:assert/strict';
import { test } from 'vitest';
import { calculateSchedule, InvalidWorkflowError } from '../workflow-schedule/index.ts';
import { validateWorkflow } from '../workflow-validation/index.ts';
import type { Workflow, WorkflowConnection, WorkflowStep } from '../workflow/index.ts';

function step(
  id: string,
  durationMinutes: number,
  name = id,
): WorkflowStep {
  return {
    id,
    name,
    durationMinutes,
    position: { x: 0, y: 0 },
  };
}

function connection(
  id: string,
  fromStepId: string,
  toStepId: string,
): WorkflowConnection {
  return { id, fromStepId, toStepId };
}

function workflow(
  steps: WorkflowStep[],
  connections: WorkflowConnection[] = [],
): Workflow {
  return { steps, connections };
}

function assertIssue(
  result: ReturnType<typeof validateWorkflow>,
  code: string,
  path: string,
): void {
  assert.equal(result.valid, false);
  assert.ok(
    result.issues.some((issue) => issue.code === code && issue.path === path),
    `expected issue ${code} at ${path}; received ${JSON.stringify(result.issues)}`,
  );
}

test('validates the required workflow shape and rejects malformed input', () => {
  for (const input of [null, undefined, [], 'workflow', 42, {}]) {
    const result = validateWorkflow(input);
    assert.equal(result.valid, false, `expected ${String(input)} to be invalid`);
    assert.ok(result.issues.length > 0);
  }
});

test('rejects a step name containing only whitespace', () => {
  const result = validateWorkflow(workflow([step('cutting', 20, ' \t\n ')]));

  assertIssue(result, 'invalid_step_name', 'steps[0].name');
});

test('rejects zero, negative, NaN, and infinite durations', () => {
  for (const durationMinutes of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = validateWorkflow(workflow([step('cutting', durationMinutes)]));

    assertIssue(result, 'invalid_step_duration', 'steps[0].durationMinutes');
  }
});

test('rejects connections that refer to a missing step', () => {
  const result = validateWorkflow(
    workflow(
      [step('assembly', 15)],
      [connection('cutting-assembly', 'missing-step', 'assembly')],
    ),
  );

  assertIssue(result, 'missing_connection_source', 'connections[0].fromStepId');
});

test('rejects duplicate step IDs', () => {
  const result = validateWorkflow(
    workflow([step('shared-id', 10, 'First'), step('shared-id', 15, 'Second')]),
  );

  assertIssue(result, 'duplicate_step_id', 'steps[1].id');
});

test('rejects duplicate connection IDs', () => {
  const result = validateWorkflow(
    workflow(
      [step('a', 5), step('b', 8), step('c', 10)],
      [connection('same-id', 'a', 'b'), connection('same-id', 'a', 'c')],
    ),
  );

  assertIssue(result, 'duplicate_connection_id', 'connections[1].id');
});

test('rejects non-finite canvas coordinates', () => {
  for (const x of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const result = validateWorkflow(workflow([{ ...step('a', 5), position: { x, y: 0 } }]));

    assertIssue(result, 'invalid_step_position', 'steps[0].position.x');
  }
});

test('does not require unique step names', () => {
  const result = validateWorkflow(
    workflow([step('a', 5, 'Preparation'), step('b', 10, 'Preparation')]),
  );

  assert.equal(result.valid, true);
});

test('rejects a directed cycle', () => {
  const result = validateWorkflow(
    workflow(
      [step('cutting', 20), step('assembly', 15)],
      [
        connection('cutting-assembly', 'cutting', 'assembly'),
        connection('assembly-cutting', 'assembly', 'cutting'),
      ],
    ),
  );

  assertIssue(result, 'workflow_cycle', 'connections');
});

test('calculateSchedule rejects a cyclic workflow with InvalidWorkflowError', () => {
  const cyclicWorkflow = workflow(
    [step('cutting', 20), step('assembly', 15)],
    [
      connection('cutting-assembly', 'cutting', 'assembly'),
      connection('assembly-cutting', 'assembly', 'cutting'),
    ],
  );

  assert.throws(() => calculateSchedule(cyclicWorkflow), InvalidWorkflowError);
});
test('calculates the brief example and identifies its critical path', () => {
  const schedule = calculateSchedule(
    workflow(
      [
        step('cutting', 20, 'Cutting'),
        step('preparation', 10, 'Preparation'),
        step('assembly', 15, 'Assembly'),
      ],
      [
        connection('cutting-assembly', 'cutting', 'assembly'),
        connection('preparation-assembly', 'preparation', 'assembly'),
      ],
    ),
  );

  assert.equal(schedule.totalDurationMinutes, 35);
  assert.deepEqual(schedule.stepTimings, {
    cutting: { earliestStartMinutes: 0, earliestFinishMinutes: 20 },
    preparation: { earliestStartMinutes: 0, earliestFinishMinutes: 10 },
    assembly: { earliestStartMinutes: 20, earliestFinishMinutes: 35 },
  });
  assert.deepEqual(schedule.startingStepIds, ['cutting', 'preparation']);
  assert.deepEqual(schedule.criticalPathStepIds, ['cutting', 'assembly']);
  assert.deepEqual(schedule.criticalPathConnectionIds, ['cutting-assembly']);
});

test('starts a step after its latest-finishing prerequisite', () => {
  const schedule = calculateSchedule(
    workflow(
      [step('short', 10), step('long', 20), step('assembly', 15)],
      [
        connection('short-assembly', 'short', 'assembly'),
        connection('long-assembly', 'long', 'assembly'),
      ],
    ),
  );

  assert.deepEqual(schedule.stepTimings.assembly, {
    earliestStartMinutes: 20,
    earliestFinishMinutes: 35,
  });
  assert.equal(schedule.totalDurationMinutes, 35);
});

test('calculates correctly when steps are not listed in topological order', () => {
  const schedule = calculateSchedule(
    workflow(
      [step('finish', 5), step('start', 10)],
      [connection('start-finish', 'start', 'finish')],
    ),
  );

  assert.equal(schedule.totalDurationMinutes, 15);
  assert.deepEqual(schedule.stepTimings.start, {
    earliestStartMinutes: 0,
    earliestFinishMinutes: 10,
  });
  assert.deepEqual(schedule.stepTimings.finish, {
    earliestStartMinutes: 10,
    earliestFinishMinutes: 15,
  });
  assert.deepEqual(schedule.criticalPathStepIds, ['start', 'finish']);
  assert.deepEqual(schedule.criticalPathConnectionIds, ['start-finish']);
});

test('supports multiple starts and disconnected components', () => {
  const schedule = calculateSchedule(
    workflow(
      [step('independent', 2), step('prep', 3), step('build', 4), step('other', 5)],
      [connection('prep-build', 'prep', 'build')],
    ),
  );

  assert.deepEqual(schedule.startingStepIds, ['independent', 'prep', 'other']);
  assert.deepEqual(schedule.stepTimings.build, {
    earliestStartMinutes: 3,
    earliestFinishMinutes: 7,
  });
  assert.equal(schedule.totalDurationMinutes, 7);
  assert.deepEqual(schedule.criticalPathStepIds, ['prep', 'build']);
  assert.deepEqual(schedule.criticalPathConnectionIds, ['prep-build']);
});

test('an isolated step is the complete critical path', () => {
  const schedule = calculateSchedule(workflow([step('solo', 12)]));

  assert.equal(schedule.totalDurationMinutes, 12);
  assert.deepEqual(schedule.stepTimings.solo, {
    earliestStartMinutes: 0,
    earliestFinishMinutes: 12,
  });
  assert.deepEqual(schedule.startingStepIds, ['solo']);
  assert.deepEqual(schedule.criticalPathStepIds, ['solo']);
  assert.deepEqual(schedule.criticalPathConnectionIds, []);
});
test('returns zero duration and an empty critical path for an empty workflow', () => {
  const schedule = calculateSchedule(workflow([]));

  assert.equal(schedule.totalDurationMinutes, 0);
  assert.deepEqual(schedule.stepTimings, {});
  assert.deepEqual(schedule.startingStepIds, []);
  assert.deepEqual(schedule.criticalPathStepIds, []);
  assert.deepEqual(schedule.criticalPathConnectionIds, []);
});

test('returns a valid critical path whose duration equals the workflow duration', () => {
  const input = workflow(
    [step('a', 8), step('b', 6), step('c', 12), step('d', 9), step('e', 4)],
    [
      connection('a-b', 'a', 'b'),
      connection('b-c', 'b', 'c'),
      connection('d-e', 'd', 'e'),
    ],
  );
  const schedule = calculateSchedule(input);
  const stepsById = new Map(input.steps.map((item) => [item.id, item]));
  const connectionsById = new Map(input.connections.map((item) => [item.id, item]));

  assert.ok(schedule.criticalPathStepIds.length > 0);
  assert.equal(
    schedule.criticalPathStepIds.reduce(
      (total, id) => total + (stepsById.get(id)?.durationMinutes ?? 0),
      0,
    ),
    schedule.totalDurationMinutes,
  );
  assert.equal(
    schedule.criticalPathConnectionIds.length,
    schedule.criticalPathStepIds.length - 1,
  );

  for (let index = 0; index < schedule.criticalPathConnectionIds.length; index += 1) {
    const edge = connectionsById.get(schedule.criticalPathConnectionIds[index]);
    assert.ok(edge);
    assert.equal(edge.fromStepId, schedule.criticalPathStepIds[index]);
    assert.equal(edge.toStepId, schedule.criticalPathStepIds[index + 1]);
  }
});
