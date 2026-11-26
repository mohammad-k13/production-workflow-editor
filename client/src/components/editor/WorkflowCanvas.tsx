import type { ComponentProps, ReactNode, Ref } from 'react';
import type { WorkflowId } from '../../api/workflows.ts';
import { WorkflowGraph } from '../WorkflowGraph.tsx';

type WorkflowCanvasProps = {
  canvasRef: Ref<HTMLElement>;
  workflowId: WorkflowId;
  loading: boolean;
  graph: ComponentProps<typeof WorkflowGraph> | null;
  children: ReactNode;
};

export function WorkflowCanvas({ canvasRef, workflowId, loading, graph, children }: WorkflowCanvasProps) {
  return (
    <section className="workflow-canvas" ref={canvasRef} aria-label="Workflow graph" aria-busy={loading}>
      {graph && <WorkflowGraph key={workflowId} {...graph} />}
      {children}
    </section>
  );
}
