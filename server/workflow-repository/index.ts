import { createHash } from 'node:crypto';
import type { Workflow } from '../../shared/workflow/index.ts';
import { readWorkflow, writeWorkflow } from '../workflow-file.ts';
import { workflowRegistry, type WorkflowId } from '../workflow-registry/index.ts';

export type WorkflowMetadata = { id: WorkflowId; name: string };
export type SaveResult = { revision: number; saved: boolean; version?: string; conflict?: true };

export function versionOf(workflow: Workflow): string {
  return createHash('sha256').update(JSON.stringify(workflow)).digest('hex');
}

export interface WorkflowRepository {
  list(): WorkflowMetadata[];
  revision(id: WorkflowId): number;
  read(id: WorkflowId): Promise<Workflow>;
  save(id: WorkflowId, workflow: Workflow, expectedVersion?: string): Promise<SaveResult>;
}

type AtomicWriter = (
  workflow: Workflow,
  filePath: string,
  shouldCommit: () => boolean,
) => Promise<boolean>;

export function createFileWorkflowRepository(
  directory = process.env.WORKFLOW_DATA_DIR ?? 'data/workflows',
  atomicWriter: AtomicWriter = writeWorkflow,
): WorkflowRepository {
  const nextRevision = new Map<WorkflowId, number>();
  const committedRevision = new Map<WorkflowId, number>();
  const latestRevision = new Map<WorkflowId, number>();
  const pendingWrites = new Map<WorkflowId, Promise<void>>();
  const pathFor = (id: WorkflowId) => `${directory}/${id}.json`;
  const read = async (id: WorkflowId) =>
    await readWorkflow(pathFor(id)) ?? workflowRegistry[id].initialWorkflow;

  return {
    list: () =>
      (Object.keys(workflowRegistry) as WorkflowId[]).map((id) => ({
        id,
        name: workflowRegistry[id].name,
      })),

    revision: (id) => committedRevision.get(id) ?? 0,

    read,

    async save(id, workflow, expectedVersion) {
      const revision = (nextRevision.get(id) ?? 0) + 1;
      nextRevision.set(id, revision);
      if (expectedVersion === undefined) latestRevision.set(id, revision);
      const previousWrite = pendingWrites.get(id) ?? Promise.resolve();
      const canCommit = () => expectedVersion !== undefined || latestRevision.get(id) === revision;
      const write = previousWrite.catch(() => undefined).then(async (): Promise<SaveResult> => {
        if (!canCommit()) return { revision, saved: false };
        // Compare and write under the same per-workflow queue so no other save
        // can change the base document between these two operations.
        if (expectedVersion !== undefined) {
          const version = versionOf(await read(id));
          if (version !== expectedVersion) return { revision, saved: false, conflict: true, version };
        }
        const committed = await atomicWriter(workflow, pathFor(id), canCommit);
        if (committed) committedRevision.set(id, revision);
        return { revision, saved: committed && canCommit(), version: committed ? versionOf(workflow) : undefined };
      });
      const pending = write.then(() => undefined, () => undefined);
      pendingWrites.set(id, pending);
      try {
        return await write;
      } finally {
        if (pendingWrites.get(id) === pending) pendingWrites.delete(id);
      }
    },
  };
}
