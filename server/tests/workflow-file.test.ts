import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { exampleWorkflow } from '../../shared/example-workflow.ts';
import { readWorkflow, writeWorkflow } from '../workflow-file.ts';

test('writeWorkflow round-trips a document', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-file-'));
  const filePath = join(directory, 'nested', 'workflow.json');

  try {
    await writeWorkflow(exampleWorkflow, filePath);
    assert.deepEqual(await readWorkflow(filePath), exampleWorkflow);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('readWorkflow returns null when the file is missing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-file-'));
  const filePath = join(directory, 'missing-workflow.json');

  try {
    assert.equal(await readWorkflow(filePath), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
