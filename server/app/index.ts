import express from 'express';
import { createWorkflowRouter, workflowErrorHandler } from '../workflow-api/index.ts';
import { createFileWorkflowRepository, type WorkflowRepository } from '../workflow-repository/index.ts';

export function createApp(repository: WorkflowRepository = createFileWorkflowRepository()) {
  const app = express();
  app.use(express.json());
  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });
  app.use('/api/workflows', createWorkflowRouter(repository));
  app.use((_request, response) => {
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });
  app.use(workflowErrorHandler);
  return app;
}
