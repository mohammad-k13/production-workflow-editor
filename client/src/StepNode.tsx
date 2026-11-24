import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

export type StepNodeData = {
  name: string;
  durationMinutes: number;
};

export type StepNode = Node<StepNodeData, 'step'>;

export function StepNodeView({ data, isConnectable }: NodeProps<StepNode>) {
  return (
    <div className="step-node">
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        isConnectableStart={isConnectable}
        isConnectableEnd={isConnectable}
      />
      <p className="step-node__name">{data.name}</p>
      <p className="step-node__duration">{data.durationMinutes} minutes</p>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        isConnectableStart={isConnectable}
        isConnectableEnd={isConnectable}
      />
    </div>
  );
}
