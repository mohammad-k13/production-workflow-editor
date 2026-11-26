import type { WorkflowConnection } from '../workflow/index.ts';
import { topologicallyOrderStepIds } from '../workflow-graph/index.ts';

export type WorkflowValidationIssue = {
  code: string;
  path: string;
  message: string;
};

export type WorkflowValidationResult = {
  valid: boolean;
  issues: WorkflowValidationIssue[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Validate untrusted workflow data before it is calculated or persisted. */
export function validateWorkflow(input: unknown): WorkflowValidationResult {
  const issues: WorkflowValidationIssue[] = [];
  const addIssue = (code: string, path: string, message: string) => {
    issues.push({ code, path, message });
  };

  if (!isRecord(input)) {
    return {
      valid: false,
      issues: [
        {
          code: 'invalid_workflow',
          path: '',
          message: 'Workflow must be an object.',
        },
      ],
    };
  }

  if (!Array.isArray(input.steps)) {
    addIssue('invalid_steps', 'steps', 'Steps must be an array.');
  }
  if (!Array.isArray(input.connections)) {
    addIssue('invalid_connections', 'connections', 'Connections must be an array.');
  }
  if (!Array.isArray(input.steps) || !Array.isArray(input.connections)) {
    return { valid: false, issues };
  }

  const stepIds = new Set<string>();
  const graphStepIds: string[] = [];
  let graphStructureIsValid = true;

  input.steps.forEach((value, index) => {
    const path = `steps[${index}]`;
    if (!isRecord(value)) {
      addIssue('invalid_step', path, 'Step must be an object.');
      graphStructureIsValid = false;
      return;
    }

    const { id, name, durationMinutes, position } = value;

    if (!isNonEmptyString(id)) {
      addIssue('invalid_step_id', `${path}.id`, 'Step ID must be a non-empty string.');
      graphStructureIsValid = false;
    } else {
      if (stepIds.has(id)) {
        addIssue('duplicate_step_id', `${path}.id`, `Step ID "${id}" is duplicated.`);
        graphStructureIsValid = false;
      }
      stepIds.add(id);
      graphStepIds.push(id);
    }

    if (typeof name !== 'string' || name.trim().length === 0) {
      addIssue('invalid_step_name', `${path}.name`, 'Step name must not be empty.');
    }

    if (!isFiniteNumber(durationMinutes) || durationMinutes <= 0) {
      addIssue(
        'invalid_step_duration',
        `${path}.durationMinutes`,
        'Estimated duration must be a finite number greater than zero.',
      );
    }

    if (!isRecord(position)) {
      addIssue('invalid_step_position', `${path}.position`, 'Step position must be an object.');
    } else {
      const { x, y } = position;
      if (!isFiniteNumber(x)) {
        addIssue('invalid_step_position', `${path}.position.x`, 'Position x must be finite.');
      }
      if (!isFiniteNumber(y)) {
        addIssue('invalid_step_position', `${path}.position.y`, 'Position y must be finite.');
      }
    }
  });

  const parsedConnections: WorkflowConnection[] = [];
  const connectionIds = new Set<string>();
  input.connections.forEach((value, index) => {
    const path = `connections[${index}]`;
    if (!isRecord(value)) {
      addIssue('invalid_connection', path, 'Connection must be an object.');
      graphStructureIsValid = false;
      return;
    }

    const { id, fromStepId, toStepId } = value;
    let connectionIsValid = true;

    if (!isNonEmptyString(id)) {
      addIssue('invalid_connection_id', `${path}.id`, 'Connection ID must be a non-empty string.');
      connectionIsValid = false;
      graphStructureIsValid = false;
    } else {
      if (connectionIds.has(id)) {
        addIssue(
          'duplicate_connection_id',
          `${path}.id`,
          `Connection ID "${id}" is duplicated.`,
        );
        connectionIsValid = false;
        graphStructureIsValid = false;
      }
      connectionIds.add(id);
    }

    if (!isNonEmptyString(fromStepId)) {
      addIssue(
        'invalid_connection_source',
        `${path}.fromStepId`,
        'Connection source must be a non-empty step ID.',
      );
      connectionIsValid = false;
      graphStructureIsValid = false;
    } else if (!stepIds.has(fromStepId)) {
      addIssue(
        'missing_connection_source',
        `${path}.fromStepId`,
        `Connection source step "${fromStepId}" does not exist.`,
      );
      connectionIsValid = false;
      graphStructureIsValid = false;
    }

    if (!isNonEmptyString(toStepId)) {
      addIssue(
        'invalid_connection_target',
        `${path}.toStepId`,
        'Connection target must be a non-empty step ID.',
      );
      connectionIsValid = false;
      graphStructureIsValid = false;
    } else if (!stepIds.has(toStepId)) {
      addIssue(
        'missing_connection_target',
        `${path}.toStepId`,
        `Connection target step "${toStepId}" does not exist.`,
      );
      connectionIsValid = false;
      graphStructureIsValid = false;
    }

    if (
      connectionIsValid &&
      typeof id === 'string' &&
      typeof fromStepId === 'string' &&
      typeof toStepId === 'string'
    ) {
      parsedConnections.push({ id, fromStepId, toStepId });
    }
  });

  if (graphStructureIsValid) {
    const topologicalOrder = topologicallyOrderStepIds(graphStepIds, parsedConnections);
    if (topologicalOrder.hasCycle) {
      addIssue('workflow_cycle', 'connections', 'Workflow dependencies must not contain a cycle.');
    }
  }

  return { valid: issues.length === 0, issues };
}
