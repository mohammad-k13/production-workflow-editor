import { Router, type ErrorRequestHandler } from 'express';
import { validateWorkflow } from '../../shared/workflow-validation/index.ts';
import { workflowVersionHeader, type Workflow } from '../../shared/workflow/index.ts';
import { versionOf, type WorkflowRepository } from '../workflow-repository/index.ts';
import { isWorkflowId } from '../workflow-registry/index.ts';

export function createWorkflowRouter(repository: WorkflowRepository): Router {
  const router = Router();

  router.get('/', (_request, response) => {
    response.json({ workflows: repository.list() });
  });

  router.get('/:id', async (request, response, next) => {
    const id = request.params.id;
    if (!isWorkflowId(id)) {
      response.status(404).json({ error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found.' } });
      return;
    }
    try {
      const workflow = await repository.read(id);
      response.set('Cache-Control', 'no-store').json({
        id,
        name: repository.list().find((item) => item.id === id)?.name,
        version: versionOf(workflow),
        workflow,
      });
    } catch (error) {
      next(error);
    }
  });

  router.put('/:id', async (request, response, next) => {
    const id = request.params.id;
    if (!isWorkflowId(id)) {
      response.status(404).json({ error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found.' } });
      return;
    }
    const validation = validateWorkflow(request.body);
    if (!validation.valid) {
      response.status(422).json({
        error: {
          code: 'INVALID_WORKFLOW',
          message: 'Workflow data is invalid.',
          issues: validation.issues,
        },
      });
      return;
    }
    const expectedVersion = request.get(workflowVersionHeader);
    if (expectedVersion === undefined) {
      response.status(428).json({ error: { code: 'WORKFLOW_VERSION_REQUIRED', message: 'Load the workflow before saving it.' } });
      return;
    }
    if (!/^[a-f0-9]{64}$/.test(expectedVersion)) {
      response.status(400).json({ error: { code: 'INVALID_WORKFLOW_VERSION', message: 'The workflow version is invalid.' } });
      return;
    }
    try {
      const result = await repository.save(id, request.body as Workflow, expectedVersion);
      if (result.conflict) {
        response.status(409).json({
          version: result.version,
          error: { code: 'WORKFLOW_CONFLICT', message: 'Another editor saved a newer workflow.' },
        });
        return;
      }
      if (!result.saved) throw new Error('Workflow write did not commit.');
      response.json({ id, version: result.version, status: 'saved' });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export const workflowErrorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (isRecord(error) && error.type === 'entity.parse.failed') {
    response.status(400).json({ error: { code: 'MALFORMED_JSON', message: 'Request body must be valid JSON.' } });
    return;
  }
  if (isRecord(error) && error.type === 'entity.too.large') {
    response.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'The workflow document is too large.' } });
    return;
  }
  response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'The workflow request could not be completed.' } });
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
