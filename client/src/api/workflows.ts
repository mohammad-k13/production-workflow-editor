import { workflowVersionHeader, type Workflow } from '../../../shared/workflow/index.ts';
import { validateWorkflow } from '../../../shared/workflow-validation/index.ts';
import { httpClient, isRecord } from './httpClient.ts';

export type WorkflowId = 'example' | 'large';
export type WorkflowMetadata = { id: WorkflowId; name: string };
export type LoadedWorkflow = WorkflowMetadata & { version: string; workflow: Workflow };
export type WorkflowSaveResult = { status: 'saved' | 'conflict'; version: string };

export async function listWorkflows(signal?: AbortSignal): Promise<WorkflowMetadata[]> {
  const { data: body } = await httpClient.get<unknown>('/workflows', { signal });
  if (!isRecord(body) || !Array.isArray(body.workflows) ||
    !body.workflows.every(isWorkflowMetadata)) throw invalidResponse();
  return body.workflows;
}

export async function loadWorkflow(id: WorkflowId, signal?: AbortSignal): Promise<LoadedWorkflow> {
  const { data: body } = await httpClient.get<unknown>(`/workflows/${id}`, {
    signal,
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!isWorkflowMetadata(body) || body.id !== id || !validateWorkflow(body.workflow).valid) {
    throw invalidResponse();
  }
  if (body.version === undefined) {
    throw new Error('The workflow server is running an older version. Restart both processes with npm run dev, then retry.');
  }
  if (!isVersion(body.version)) throw invalidResponse();
  return { id, name: body.name, version: body.version, workflow: body.workflow as Workflow };
}

export async function saveWorkflow(id: WorkflowId, workflow: Workflow, version: string): Promise<WorkflowSaveResult> {
  const { data: body, status } = await httpClient.put<unknown>(`/workflows/${id}`, workflow, {
    headers: { 'content-type': 'application/json', [workflowVersionHeader]: version },
    validateStatus: (status) => (status >= 200 && status < 300) || status === 409,
  });
  if (!isRecord(body) || !isVersion(body.version)) throw invalidResponse();
  if (status === 409 && isRecord(body.error) && body.error.code === 'WORKFLOW_CONFLICT') {
    return { status: 'conflict', version: body.version };
  }
  if (status === 409 || body.id !== id || body.status !== 'saved') throw invalidResponse();
  return { status: 'saved', version: body.version };
}

function isWorkflowMetadata(value: unknown): value is WorkflowMetadata & Record<string, unknown> {
  return isRecord(value) &&
    (value.id === 'example' || value.id === 'large') &&
    typeof value.name === 'string';
}

function isVersion(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function invalidResponse(): Error {
  return new Error('The workflow server returned an invalid response.');
}
