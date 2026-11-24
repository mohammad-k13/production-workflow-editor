import { MarkerType, Position, type Edge, type Node } from "@xyflow/react";
import type { Workflow } from "../../shared/workflow.ts";
import type { StepNodeData } from "./StepNode.tsx";

export function workflowToFlow(workflow: Workflow): {
  nodes: Node<StepNodeData, "step">[];
  edges: Edge[];
} {
  return {
    nodes: workflow.steps.map((step) => ({
      id: step.id,
      type: "step",
      position: { ...step.position },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        name: step.name,
        durationMinutes: step.durationMinutes,
      },
    })),
    edges: workflow.connections.map((connection) => ({
      id: connection.id,
      source: connection.fromStepId,
      target: connection.toStepId,
      markerEnd: { type: MarkerType.Arrow },
    })),
  };
}
