import { Router, type ErrorRequestHandler } from 'express';
import { validateWorkflow } from '../../shared/workflow-validation/index.ts';
import type { Workflow } from '../../shared/workflow/index.ts';
import type { WorkflowRepository } from '../workflow-repository/index.ts';
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
      response.json({ id, name: repository.list().find((item) => item.id === id)?.name, workflow: await repository.read(id) });
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
    try {
      const result = await repository.save(id, request.body as Workflow);
      response.status(result.saved ? 200 : 202).json({
        id,
        revision: result.revision,
        status: result.saved ? 'saved' : 'superseded',
      });
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
  response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'The workflow request could not be completed.' } });
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
