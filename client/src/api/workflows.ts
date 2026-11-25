import type { Workflow } from '../../../shared/workflow/index.ts';

export type WorkflowId = 'example' | 'large';
export type WorkflowMetadata = { id: WorkflowId; name: string };
export type LoadedWorkflow = { id: WorkflowId; name: string; revision: number; workflow: Workflow };
export type WorkflowSaveResult = { id: WorkflowId; revision: number; status: 'saved' | 'superseded' };

export async function listWorkflows(): Promise<WorkflowMetadata[]> {
  const response = await fetch('/api/workflows');
  const body = await readResponse<{ workflows: WorkflowMetadata[] }>(response);
  return body.workflows;
}

export async function loadWorkflow(id: WorkflowId): Promise<LoadedWorkflow> {
  const response = await fetch(`/api/workflows/${id}`);
  return readResponse<LoadedWorkflow>(response);
}

export async function saveWorkflow(id: WorkflowId, workflow: Workflow): Promise<WorkflowSaveResult> {
  const response = await fetch(`/api/workflows/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(workflow),
  });
  return readResponse<WorkflowSaveResult>(response);
}

async function readResponse<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string'
      ? body.error.message
      : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return body as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
