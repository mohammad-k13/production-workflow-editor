import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'vitest';
import { AxiosError, isCancel, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { workflowVersionHeader, type Workflow } from '../../shared/workflow/index.ts';
import { ApiRequestError, httpClient } from '../src/api/httpClient.ts';
import { listWorkflows, loadWorkflow, saveWorkflow } from '../src/api/workflows.ts';

const currentVersion = 'a'.repeat(64);
const nextVersion = 'b'.repeat(64);
const workflow: Workflow = {
  steps: [{ id: 'cutting', name: 'Cutting', durationMinutes: 2, position: { x: 12, y: 34 } }],
  connections: [],
};
const smallMetadata = { id: 'example', name: 'Example workflow' } as const;
const largeMetadata = { id: 'large', name: 'Large workflow' } as const;
const exampleResponse = { ...smallMetadata, workflow, version: currentVersion };
const conflictResponse = {
  error: { code: 'WORKFLOW_CONFLICT', message: 'Another editor saved a newer version.' },
  version: nextVersion,
};
const invalidResponse = /workflow server returned an invalid response/i;

type MockResponse = { status: number; data: unknown };

const originalAdapter = httpClient.defaults.adapter;

beforeEach(() => { httpClient.defaults.adapter = originalAdapter; });
afterEach(() => { httpClient.defaults.adapter = originalAdapter; });

function mockHttp(respond: (config: InternalAxiosRequestConfig) => MockResponse) {
  httpClient.defaults.adapter = async (config) => {
    const { status, data } = respond(config);
    const response: AxiosResponse<unknown> = { config, data, status, statusText: String(status), headers: {} };
    // Axios adapters decide whether non-2xx responses are rejected.
    if (config.validateStatus && !config.validateStatus(status)) {
      throw new AxiosError(`Request failed with status code ${status}`, undefined, config, undefined, response);
    }
    return response;
  };
}

function checkRequest(config: InternalAxiosRequestConfig, method: string, path: string) {
  assert.equal(config.method, method);
  assert.equal(new URL(httpClient.getUri(config), 'http://localhost').pathname, path);
}

test('lists the two workflows using the central Axios client and forwards cancellation', async () => {
  const { signal } = new AbortController();
  mockHttp((config) => {
    checkRequest(config, 'get', '/api/workflows');
    assert.equal(config.signal, signal);
    return { status: 200, data: { workflows: [smallMetadata, largeMetadata] } };
  });
  assert.deepEqual(await listWorkflows(signal), [smallMetadata, largeMetadata]);
});

test('loads the requested fixture with its version and full workflow document', async () => {
  const { signal } = new AbortController();
  const response = { ...largeMetadata, workflow, version: currentVersion };
  mockHttp((config) => {
    checkRequest(config, 'get', '/api/workflows/large');
    assert.equal(config.signal, signal);
    return { status: 200, data: response };
  });
  assert.deepEqual(await loadWorkflow('large', signal), response);
});

test('rejects an invalid catalog response', async () => {
  mockHttp(() => ({
    status: 200,
    data: { workflows: [smallMetadata, { id: 'unknown', name: 'Unknown workflow' }] },
  }));
  await assert.rejects(listWorkflows(), invalidResponse);
});

const malformedWorkflowResponses = [
    ['wrong fixture', { ...exampleResponse, id: 'large' }],
    ['invalid version', { ...exampleResponse, version: 'not-a-version' }],
    ['invalid workflow data', { ...exampleResponse, workflow: { ...workflow, steps: [{ ...workflow.steps[0], durationMinutes: 0 }] } }],
    ['non-JSON response', '<html>Unexpected error page</html>'],
] as const;

test.each(malformedWorkflowResponses.map(([label, data]) => ({ label, data })))
  ('rejects malformed workflow response: $label', async ({ label, data }) => {
    mockHttp(() => ({ status: 200, data }));
    await assert.rejects(loadWorkflow('example'), invalidResponse, label);
  });

test('gives restart guidance for a valid response from an older server', async () => {
  mockHttp(() => ({ status: 200, data: { ...smallMetadata, workflow } }));
  await assert.rejects(loadWorkflow('example'), /running an older version.*npm run dev/i);
});

test('sends the workflow and its version on PUT and returns the new version', async () => {
  mockHttp((config) => {
    checkRequest(config, 'put', '/api/workflows/example');
    assert.equal(config.headers.get(workflowVersionHeader), currentVersion);
    assert.match(String(config.headers.get('content-type')), /^application\/json/);
    assert.deepEqual(JSON.parse(String(config.data)), workflow);
    return { status: 200, data: { id: 'example', status: 'saved', version: nextVersion } };
  });
  assert.deepEqual(await saveWorkflow('example', workflow, currentVersion), { status: 'saved', version: nextVersion });
});

test('returns the competing version when the server reports a workflow conflict', async () => {
  mockHttp(() => ({ status: 409, data: conflictResponse }));
  assert.deepEqual(await saveWorkflow('example', workflow, currentVersion), { status: 'conflict', version: nextVersion });
});

const invalidSaveAcknowledgments = [
    ['wrong fixture', { status: 200, data: { id: 'large', status: 'saved', version: nextVersion } }],
    ['invalid save status', { status: 200, data: { id: 'example', status: 'pending', version: nextVersion } }],
    ['wrong conflict code', { status: 409, data: { ...conflictResponse, error: { code: 'NOT_A_WORKFLOW_CONFLICT' } } }],
    ['missing conflict version', { status: 409, data: { error: conflictResponse.error } }],
] as const;

test.each(invalidSaveAcknowledgments.map(([label, response]) => ({ label, response })))
  ('rejects invalid save or conflict acknowledgment: $label', async ({ label, response }) => {
    mockHttp(() => response);
    await assert.rejects(saveWorkflow('example', workflow, currentVersion), invalidResponse, label);
  });

test('normalizes a rejected HTTP request across workflow endpoints', async () => {
  mockHttp(() => ({ status: 409, data: conflictResponse }));
  await assert.rejects(loadWorkflow('example'), (error: unknown) => {
    assert.ok(error instanceof ApiRequestError);
    assert.equal(error.status, 409);
    assert.equal(error.code, 'WORKFLOW_CONFLICT');
    assert.equal(error.message, conflictResponse.error.message);
    return true;
  });
});

test('uses an HTTP status fallback for responses without a structured API error', async () => {
  mockHttp(() => ({ status: 502, data: '<html>Bad gateway</html>' }));
  await assert.rejects(listWorkflows(), (error: unknown) => {
    assert.ok(error instanceof ApiRequestError);
    assert.equal(error.status, 502);
    assert.equal(error.message, 'Request failed (502).');
    return true;
  });
});

test.each(['ERR_NETWORK', 'ECONNABORTED'] as const)
  ('normalizes %s failures without exposing transport details', async (code) => {
    mockHttp((config) => {
      throw new AxiosError('Raw response for internal-host.local', code, config);
    });
    await assert.rejects(listWorkflows(), (error: unknown) => {
      assert.ok(error instanceof ApiRequestError);
      assert.equal(error.status, undefined);
      assert.ok(error.message.length > 0);
      assert.doesNotMatch(error.message, /internal-host\.local/);
      return true;
    });
  });

test('preserves Axios cancellation rather than turning it into an API failure', async () => {
  const controller = new AbortController();
  mockHttp((config) => {
    assert.equal(config.signal, controller.signal);
    controller.abort();
    return { status: 200, data: exampleResponse };
  });
  await assert.rejects(loadWorkflow('example', controller.signal), (error: unknown) => {
    assert.ok(isCancel(error));
    assert.ok(!(error instanceof ApiRequestError));
    return true;
  });
});
