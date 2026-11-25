import { workflowVersionHeader, type Workflow } from '../../../shared/workflow/index.ts';
import { validateWorkflow } from '../../../shared/workflow-validation/index.ts';

export type WorkflowId = 'example' | 'large';
export type WorkflowMetadata = { id: WorkflowId; name: string };
export type LoadedWorkflow = WorkflowMetadata & { version: string; workflow: Workflow };
export type WorkflowSaveResult = { status: 'saved' | 'conflict'; version: string };

export async function listWorkflows(signal?: AbortSignal): Promise<WorkflowMetadata[]> {
  const response = await fetch('/api/workflows', { signal });
  const body = await readResponse(response);
  if (!Array.isArray(body.workflows) || !body.workflows.every(isWorkflowMetadata)) throw invalidResponse();
  return body.workflows;
}

export async function loadWorkflow(id: WorkflowId, signal?: AbortSignal): Promise<LoadedWorkflow> {
  const response = await fetch(`/api/workflows/${id}`, { signal, cache: 'no-store' });
  const body = await readResponse(response);
  if (!isWorkflowMetadata(body) || body.id !== id || !isVersion(body.version) ||
    !validateWorkflow(body.workflow).valid) throw invalidResponse();
  return { id, name: body.name, version: body.version, workflow: body.workflow as Workflow };
}

export async function saveWorkflow(id: WorkflowId, workflow: Workflow, version: string): Promise<WorkflowSaveResult> {
  const response = await fetch(`/api/workflows/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', [workflowVersionHeader]: version },
    body: JSON.stringify(workflow),
  });
  const body = await readResponse(response, 409);
  if (!isVersion(body.version)) throw invalidResponse();
  if (response.status === 409 && isRecord(body.error) && body.error.code === 'WORKFLOW_CONFLICT') {
    return { status: 'conflict', version: body.version };
  }
  if (!response.ok || body.id !== id || body.status !== 'saved') throw invalidResponse();
  return { status: 'saved', version: body.version };
}

async function readResponse(response: Response, allowedErrorStatus?: number): Promise<Record<string, unknown>> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok && response.status !== allowedErrorStatus) {
    const message = isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string'
      ? body.error.message
      : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  if (!isRecord(body)) throw invalidResponse();
  return body;
}

function isWorkflowMetadata(value: unknown): value is WorkflowMetadata & Record<string, unknown> {
  return isRecord(value) &&
    (value.id === 'example' || value.id === 'large') &&
    typeof value.name === 'string';
}

function isVersion(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidResponse(): Error {
  return new Error('The workflow server returned an invalid response.');
}
