import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Workflow } from '../shared/workflow/index.ts';
import { validateWorkflow } from '../shared/workflow-validation/index.ts';

const defaultWorkflowPath = 'data/workflow.json';

export async function readWorkflow(
  filePath = defaultWorkflowPath,
): Promise<Workflow | null> {
  try {
    const contents = await readFile(resolve(filePath), 'utf8');
    const workflow: unknown = JSON.parse(contents);
    if (!validateWorkflow(workflow).valid) throw new Error('Stored workflow has invalid data.');
    return workflow as Workflow;
  } catch (error) {
    if (isMissingFile(error)) {
      return null;
    }
    throw error;
  }
}

export async function writeWorkflow(
  workflow: Workflow,
  filePath = defaultWorkflowPath,
  shouldCommit: () => boolean = () => true,
): Promise<boolean> {
  const resolvedPath = resolve(filePath);
  await mkdir(dirname(resolvedPath), { recursive: true });
  const temporaryPath = `${resolvedPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');
    if (!shouldCommit()) {
      await rm(temporaryPath, { force: true });
      return false;
    }
    await rename(temporaryPath, resolvedPath);
    return true;
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
