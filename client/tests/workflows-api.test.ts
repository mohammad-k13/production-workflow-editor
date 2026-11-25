import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
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

function mockHttp(
  context: TestContext,
  respond: (config: InternalAxiosRequestConfig) => MockResponse,
) {
  const original = httpClient.defaults.adapter;
  context.after(() => { httpClient.defaults.adapter = original; });
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

test('lists the two workflows using the central Axios client and forwards cancellation', async (context) => {
  const { signal } = new AbortController();
  mockHttp(context, (config) => {
    checkRequest(config, 'get', '/api/workflows');
    assert.equal(config.signal, signal);
    return { status: 200, data: { workflows: [smallMetadata, largeMetadata] } };
  });
  assert.deepEqual(await listWorkflows(signal), [smallMetadata, largeMetadata]);
});

test('loads the requested fixture with its version and full workflow document', async (context) => {
  const { signal } = new AbortController();
  const response = { ...largeMetadata, workflow, version: currentVersion };
  mockHttp(context, (config) => {
    checkRequest(config, 'get', '/api/workflows/large');
    assert.equal(config.signal, signal);
    return { status: 200, data: response };
  });
  assert.deepEqual(await loadWorkflow('large', signal), response);
});

test('rejects an invalid catalog response', async (context) => {
  mockHttp(context, () => ({
    status: 200,
    data: { workflows: [smallMetadata, { id: 'unknown', name: 'Unknown workflow' }] },
  }));
  await assert.rejects(listWorkflows(), invalidResponse);
});

test('rejects malformed workflow responses', async (context) => {
  const variants = [
    ['wrong fixture', { ...exampleResponse, id: 'large' }],
    ['invalid version', { ...exampleResponse, version: 'not-a-version' }],
    ['invalid workflow data', { ...exampleResponse, workflow: { ...workflow, steps: [{ ...workflow.steps[0], durationMinutes: 0 }] } }],
    ['non-JSON response', '<html>Unexpected error page</html>'],
  ] as const;
  for (const [label, data] of variants) {
    await context.test(label, async (subtest) => {
      mockHttp(subtest, () => ({ status: 200, data }));
      await assert.rejects(loadWorkflow('example'), invalidResponse);
    });
  }
});

test('gives restart guidance for a valid response from an older server', async (context) => {
  mockHttp(context, () => ({ status: 200, data: { ...smallMetadata, workflow } }));
  await assert.rejects(loadWorkflow('example'), /running an older version.*npm run dev/i);
});

test('sends the workflow and its version on PUT and returns the new version', async (context) => {
  mockHttp(context, (config) => {
    checkRequest(config, 'put', '/api/workflows/example');
    assert.equal(config.headers.get(workflowVersionHeader), currentVersion);
    assert.match(String(config.headers.get('content-type')), /^application\/json/);
    assert.deepEqual(JSON.parse(String(config.data)), workflow);
    return { status: 200, data: { id: 'example', status: 'saved', version: nextVersion } };
  });
  assert.deepEqual(await saveWorkflow('example', workflow, currentVersion), { status: 'saved', version: nextVersion });
});

test('returns the competing version when the server reports a workflow conflict', async (context) => {
  mockHttp(context, () => ({ status: 409, data: conflictResponse }));
  assert.deepEqual(await saveWorkflow('example', workflow, currentVersion), { status: 'conflict', version: nextVersion });
});

test('rejects invalid save and conflict acknowledgments', async (context) => {
  const variants = [
    ['wrong fixture', { status: 200, data: { id: 'large', status: 'saved', version: nextVersion } }],
    ['invalid save status', { status: 200, data: { id: 'example', status: 'pending', version: nextVersion } }],
    ['wrong conflict code', { status: 409, data: { ...conflictResponse, error: { code: 'NOT_A_WORKFLOW_CONFLICT' } } }],
    ['missing conflict version', { status: 409, data: { error: conflictResponse.error } }],
  ] as const;
  for (const [label, response] of variants) {
    await context.test(label, async (subtest) => {
      mockHttp(subtest, () => response);
      await assert.rejects(saveWorkflow('example', workflow, currentVersion), invalidResponse);
    });
  }
});

test('normalizes a rejected HTTP request across workflow endpoints', async (context) => {
  mockHttp(context, () => ({ status: 409, data: conflictResponse }));
  await assert.rejects(loadWorkflow('example'), (error: unknown) => {
    assert.ok(error instanceof ApiRequestError);
    assert.equal(error.status, 409);
    assert.equal(error.code, 'WORKFLOW_CONFLICT');
    assert.equal(error.message, conflictResponse.error.message);
    return true;
  });
});

test('uses an HTTP status fallback for responses without a structured API error', async (context) => {
  mockHttp(context, () => ({ status: 502, data: '<html>Bad gateway</html>' }));
  await assert.rejects(listWorkflows(), (error: unknown) => {
    assert.ok(error instanceof ApiRequestError);
    assert.equal(error.status, 502);
    assert.equal(error.message, 'Request failed (502).');
    return true;
  });
});

test('normalizes network and timeout failures without exposing transport details', async (context) => {
  for (const code of ['ERR_NETWORK', 'ECONNABORTED']) {
    await context.test(code, async (subtest) => {
      mockHttp(subtest, (config) => {
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
  }
});

test('preserves Axios cancellation rather than turning it into an API failure', async (context) => {
  const controller = new AbortController();
  mockHttp(context, (config) => {
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
