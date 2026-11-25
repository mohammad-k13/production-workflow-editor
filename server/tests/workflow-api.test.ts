import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Workflow } from '../../shared/workflow/index.ts';
import { createApp } from '../app/index.ts';
import { createFileWorkflowRepository, versionOf } from '../workflow-repository/index.ts';

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-api-'));
  const app = createApp(createFileWorkflowRepository(directory));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address.');
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}

const validWorkflow = {
  steps: [{ id: 'step-a', name: 'Step A', durationMinutes: 5, position: { x: 0, y: 0 } }],
  connections: [],
};

async function getVersion(url: string) {
  const response = await fetch(url);
  assert.equal(response.status, 200);
  const body = await response.json() as { version: string };
  assert.match(body.version, /^[0-9a-f]{64}$/);
  return body.version;
}

function putWorkflow(url: string, workflow: Workflow, version: string) {
  return fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-workflow-version': version },
    body: JSON.stringify(workflow),
  });
}

test('lists the two stable workflows and serves the initial example when no save exists', async () => {
  await withServer(async (baseUrl) => {
    const list = await fetch(`${baseUrl}/api/workflows`);
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), {
      workflows: [
        { id: 'example', name: 'Example workflow' },
        { id: 'large', name: 'Large workflow' },
      ],
    });

    const response = await fetch(`${baseUrl}/api/workflows/example`);
    assert.equal(response.status, 200);
    const body = await response.json() as { id: string; workflow: typeof validWorkflow };
    assert.equal(body.id, 'example');
    assert.equal(body.workflow.steps.length, 3);
    const large = await fetch(`${baseUrl}/api/workflows/large`);
    assert.equal(large.status, 200);
    const { workflow } = await large.json() as { workflow: typeof validWorkflow };
    assert.equal(workflow.steps.length, 100);
    assert.equal(workflow.connections.length, 200);
  });
});

test('saves a valid workflow and returns it on a later read', async () => {
  await withServer(async (baseUrl) => {
    const url = `${baseUrl}/api/workflows/example`;
    const version = await getVersion(url);
    const workflow = {
      steps: [
        { id: 'assemble', name: 'Assemble', durationMinutes: 14.5, position: { x: 123, y: -50 } },
        { id: 'pack', name: 'Pack', durationMinutes: 8, position: { x: 200, y: 40 } },
      ],
      connections: [{ id: 'a-p', fromStepId: 'assemble', toStepId: 'pack' }],
    };
    const save = await putWorkflow(url, workflow, version);
    assert.equal(save.status, 200);
    const saved = await save.json() as { version: string; status: string };
    assert.equal(saved.status, 'saved');
    assert.notEqual(saved.version, version);
    assert.equal(saved.version, await getVersion(url));

    const read = await fetch(`${baseUrl}/api/workflows/example`);
    const body = await read.json() as { workflow: typeof validWorkflow };
    assert.deepEqual(body.workflow, workflow);
  });
});

test('only one client can commit against the same starting version', async () => {
  await withServer(async (baseUrl) => {
    const url = `${baseUrl}/api/workflows/example`;
    const version = await getVersion(url);
    const alternatives = ['First editor', 'Second editor'].map((name) => ({
      steps: [{ ...validWorkflow.steps[0], name }],
      connections: [],
    }));
    const responses = await Promise.all(alternatives.map((choice) => putWorkflow(url, choice, version)));
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    const winner = responses.findIndex((response) => response.status === 200);
    const conflict = await responses[1 - winner].json() as { error: { code: string }; version: string };
    assert.equal(conflict.error.code, 'WORKFLOW_CONFLICT');
    assert.equal(conflict.version, await getVersion(url));
    const current = await fetch(url).then((response) => response.json()) as { workflow: typeof validWorkflow };
    assert.deepEqual(current.workflow, alternatives[winner]);
    const explicitReplacement = await putWorkflow(url, alternatives[1 - winner], conflict.version);
    assert.equal(explicitReplacement.status, 200);
  });
});

test('requires a version for a valid save and leaves the workflow unchanged without one', async () => {
  await withServer(async (baseUrl) => {
    const url = `${baseUrl}/api/workflows/example`;
    const version = await getVersion(url);
    const response = await fetch(url, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(validWorkflow),
    });
    assert.equal(response.status, 428);
    assert.equal(await getVersion(url), version);
  });
});

test('rejects malformed JSON and invalid workflow data without persisting either', async () => {
  await withServer(async (baseUrl) => {
    const malformed = await fetch(`${baseUrl}/api/workflows/example`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{bad json',
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), {
      error: { code: 'MALFORMED_JSON', message: 'Request body must be valid JSON.' },
    });

    const invalid = await fetch(`${baseUrl}/api/workflows/example`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ steps: [{ ...validWorkflow.steps[0], durationMinutes: 0 }], connections: [] }),
    });
    assert.equal(invalid.status, 422);
    assert.equal((await invalid.json() as { error: { code: string } }).error.code, 'INVALID_WORKFLOW');
    const current = await fetch(`${baseUrl}/api/workflows/example`);
    assert.equal((await current.json() as { workflow: { steps: unknown[] } }).workflow.steps.length, 3);
  });
});

test('returns a stable not-found error for unknown workflow identifiers', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workflows/not-a-workflow`);
    assert.equal(response.status, 404);
    assert.equal((await response.json() as { error: { code: string } }).error.code, 'WORKFLOW_NOT_FOUND');
  });
});

test('returns a JSON not-found error for unregistered API routes', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/unknown`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: { code: 'NOT_FOUND', message: 'Route not found.' },
    });
  });
});

test('only the newest overlapping save is persisted', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-save-order-'));
  try {
    const repository = createFileWorkflowRepository(directory);
    const older = { ...validWorkflow, steps: [{ ...validWorkflow.steps[0], name: 'Older' }] };
    const newer = { ...validWorkflow, steps: [{ ...validWorkflow.steps[0], name: 'Newer' }] };
    const results = await Promise.all([
      repository.save('example', older),
      repository.save('example', newer),
    ]);
    assert.deepEqual(results.map((result) => result.saved), [false, true]);
    assert.equal(results[1].revision, 2);
    const persisted = JSON.parse(await readFile(join(directory, 'example.json'), 'utf8')) as typeof validWorkflow;
    assert.equal(persisted.steps[0].name, 'Newer');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a newer request arriving during an in-flight save prevents the older atomic commit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-save-race-'));
  let releaseFirst!: () => void;
  let signalFirstStarted!: () => void;
  const firstStarted = new Promise<void>((resolve) => { signalFirstStarted = resolve; });
  const release = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let invocation = 0;
  const repository = createFileWorkflowRepository(directory, async (workflow, path, shouldCommit) => {
    invocation += 1;
    if (invocation === 1) {
      signalFirstStarted();
      await release;
    }
    if (!shouldCommit()) return false;
    const { writeWorkflow } = await import('../workflow-file.ts');
    return writeWorkflow(workflow, path, shouldCommit);
  });
  const older = { ...validWorkflow, steps: [{ ...validWorkflow.steps[0], name: 'Older' }] };
  const newer = { ...validWorkflow, steps: [{ ...validWorkflow.steps[0], name: 'Newer' }] };
  try {
    const olderSave = repository.save('example', older);
    await firstStarted;
    const newerSave = repository.save('example', newer);
    releaseFirst();
    const results = await Promise.all([olderSave, newerSave]);
    assert.deepEqual(results.map((result) => result.saved), [false, true]);
    const persisted = JSON.parse(await readFile(join(directory, 'example.json'), 'utf8')) as typeof validWorkflow;
    assert.equal(persisted.steps[0].name, 'Newer');
  } finally {
    releaseFirst();
    await rm(directory, { recursive: true, force: true });
  }
});

test('saved workflows survive repository recreation and remain isolated by ID', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-persistence-'));
  try {
    const firstRepository = createFileWorkflowRepository(directory);
    const previousVersion = versionOf(await firstRepository.read('example'));
    const customExample = { ...validWorkflow, steps: [{ ...validWorkflow.steps[0], name: 'Persisted example' }] };
    const customLarge = { ...validWorkflow, steps: [{ ...validWorkflow.steps[0], name: 'Persisted large' }] };
    await firstRepository.save('example', customExample);
    await firstRepository.save('large', customLarge);
    const secondRepository = createFileWorkflowRepository(directory);
    assert.deepEqual(await secondRepository.read('example'), customExample);
    assert.deepEqual(await secondRepository.read('large'), customLarge);
    const staleSave = await secondRepository.save('example', customLarge, previousVersion);
    assert.equal(staleSave.conflict, true);
    assert.equal(staleSave.version, versionOf(customExample));
    assert.deepEqual(await secondRepository.read('example'), customExample);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('storage read failures return a generic API error', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-read-error-'));
  try {
    const baseRepository = createFileWorkflowRepository(directory);
    const app = createApp({
      ...baseRepository,
      read: async () => { throw new Error('private storage detail'); },
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP server address.');
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/workflows/example`);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), {
        error: { code: 'INTERNAL_ERROR', message: 'The workflow request could not be completed.' },
      });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('storage errors return a generic API error and do not reveal filesystem details', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-storage-error-'));
  try {
    const stable = { ...validWorkflow, steps: [{ ...validWorkflow.steps[0], name: 'Last good' }] };
    const goodRepository = createFileWorkflowRepository(directory);
    await goodRepository.save('example', stable);
    const failingRepository = createFileWorkflowRepository(directory, async () => {
      throw new Error('private filesystem path should not escape');
    });
    const app = createApp(failingRepository);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP server address.');
    try {
      const url = `http://127.0.0.1:${address.port}/api/workflows/example`;
      const response = await putWorkflow(url, validWorkflow, await getVersion(url));
      assert.equal(response.status, 500);
      const errorBody = await response.text();
      assert.ok(errorBody.includes('INTERNAL_ERROR'));
      assert.ok(!errorBody.includes('private filesystem path'));
      assert.deepEqual(await createFileWorkflowRepository(directory).read('example'), stable);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('keeps health check available', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });
});
