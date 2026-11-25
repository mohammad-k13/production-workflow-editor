import largeWorkflow from '../../shared/large-workflow.json' with { type: 'json' };
import { exampleWorkflow } from '../../shared/example-workflow.ts';
import type { Workflow } from '../../shared/workflow/index.ts';

export const workflowRegistry = {
  example: { name: 'Example workflow', initialWorkflow: exampleWorkflow },
  large: { name: 'Large workflow', initialWorkflow: largeWorkflow as Workflow },
} satisfies Record<string, { name: string; initialWorkflow: Workflow }>;

export type WorkflowId = keyof typeof workflowRegistry;

export function isWorkflowId(value: string): value is WorkflowId {
  return Object.hasOwn(workflowRegistry, value);
}
