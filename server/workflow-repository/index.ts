import type { Workflow } from '../../shared/workflow/index.ts';
import { readWorkflow, writeWorkflow } from '../workflow-file.ts';
import { workflowRegistry, type WorkflowId } from '../workflow-registry/index.ts';

export type WorkflowMetadata = { id: WorkflowId; name: string };
export type SaveResult = { revision: number; saved: boolean };

export interface WorkflowRepository {
  list(): WorkflowMetadata[];
  revision(id: WorkflowId): number;
  read(id: WorkflowId): Promise<Workflow>;
  save(id: WorkflowId, workflow: Workflow): Promise<SaveResult>;
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

  return {
    list: () =>
      (Object.keys(workflowRegistry) as WorkflowId[]).map((id) => ({
        id,
        name: workflowRegistry[id].name,
      })),

    revision: (id) => committedRevision.get(id) ?? 0,

    async read(id) {
      const stored = await readWorkflow(`${directory}/${id}.json`);
      return stored ?? workflowRegistry[id].initialWorkflow;
    },

    async save(id, workflow) {
      const revision = (nextRevision.get(id) ?? 0) + 1;
      nextRevision.set(id, revision);
      latestRevision.set(id, revision);
      const previousWrite = pendingWrites.get(id) ?? Promise.resolve();
      let committed = false;
      const write = previousWrite.catch(() => undefined).then(async () => {
        // Drop queued saves as soon as a newer request has arrived.
        if (latestRevision.get(id) !== revision) return;
        committed = await atomicWriter(
          workflow,
          `${directory}/${id}.json`,
          () => latestRevision.get(id) === revision,
        );
        if (committed) committedRevision.set(id, revision);
      });
      pendingWrites.set(id, write);
      try {
        await write;
      } finally {
        if (pendingWrites.get(id) === write) pendingWrites.delete(id);
      }
      return { revision, saved: committed && latestRevision.get(id) === revision };
    },
  };
}
