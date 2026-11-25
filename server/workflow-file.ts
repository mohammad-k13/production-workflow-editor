import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Workflow } from '../shared/workflow/index.ts';

const defaultWorkflowPath = 'data/workflow.json';

export async function readWorkflow(
  filePath = defaultWorkflowPath,
): Promise<Workflow | null> {
  try {
    const contents = await readFile(resolve(filePath), 'utf8');
    return JSON.parse(contents) as Workflow;
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
): Promise<void> {
  const resolvedPath = resolve(filePath);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
