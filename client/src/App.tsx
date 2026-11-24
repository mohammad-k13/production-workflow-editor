import { Background, ReactFlow } from "@xyflow/react";
import { exampleWorkflow } from "../../shared/example-workflow.ts";
import { StepNodeView } from "./StepNode.tsx";
import { workflowToFlow } from "./to-flow.ts";
import "@xyflow/react/dist/style.css";

const nodeTypes = { step: StepNodeView };
const { nodes, edges } = workflowToFlow(exampleWorkflow);

export function App() {
  return (
    <main className="workflow-editor" aria-label="Workflow">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesReconnectable={false}
        deleteKeyCode={null}
        disableKeyboardA11y={true}
        panOnDrag={true}
        zoomOnScroll={true}
        colorMode="light"
        fitView
      >
        <Background />
      </ReactFlow>
    </main>
  );
}
