import { memo, useEffect, useState } from 'react';
import {
  Background, Controls, Handle, MarkerType, Position, ReactFlow, useEdgesState, useNodesState,
  type Connection, type Edge, type Node, type NodeProps, type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { WorkflowSchedule } from '../../../shared/workflow-schedule/index.ts';
import type { Workflow } from '../../../shared/workflow/index.ts';
import { formatDuration, formatMinutes } from '../formatMinutes.ts';

type StepNodeData = {
  name: string;
  durationMinutes: number;
  start?: number;
  finish?: number;
  starting: boolean;
  critical: boolean;
};

export type StepNode = Node<StepNodeData, 'step'>;
export type GraphInstance = ReactFlowInstance<StepNode, Edge>;
export type StepPosition = Pick<StepNode, 'id' | 'position'>;

const StepCard = memo(function StepCard({ data, selected }: NodeProps<StepNode>) {
  return (
    <article className={`step-node${selected ? ' step-node--selected' : ''}${data.critical ? ' step-node--critical' : ''}`}>
      <Handle type="target" position={Position.Left} aria-label="Connect from prerequisite" />
      <div className="step-node__badges">
        {data.starting && <span>Starting step</span>}
        {data.critical && <span>Critical path</span>}
      </div>
      <strong className="step-node__name" title={data.name}>{data.name || 'Unnamed step'}</strong>
      <span className="step-node__duration" title={formatMinutes(data.durationMinutes)}>
        {formatDuration(data.durationMinutes)} · duration
      </span>
      <dl className="step-node__timing">
        <StepTiming label="Earliest start" minutes={data.start} />
        <StepTiming label="Earliest finish" minutes={data.finish} />
      </dl>
      <Handle type="source" position={Position.Right} aria-label="Connect to dependent step" />
    </article>
  );
});

function StepTiming({ label, minutes }: { label: string; minutes?: number }) {
  const display = formatDuration(minutes);
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {display}
        {minutes !== undefined && Number.isFinite(minutes) && minutes >= 60 && (
          <small className="step-node__minutes">{formatMinutes(minutes)}</small>
        )}
      </dd>
    </div>
  );
}

const nodeTypes = { step: StepCard };
const deleteKeys = ['Backspace', 'Delete'];
const fitOptions = { padding: 0.24 };

export function WorkflowGraph({ workflow, schedule, editable, onReady, onConnect, onStepSelect, onConnectionSelect,
  onPositionsChange, onDelete, onPaneClick }: {
  workflow: Workflow;
  schedule: WorkflowSchedule | null;
  editable: boolean;
  onReady: (instance: GraphInstance) => void;
  onConnect: (connection: Connection) => void;
  onStepSelect: (id: string) => void;
  onConnectionSelect: (id: string) => void;
  onPositionsChange: (positions: StepPosition[]) => void;
  onDelete: (stepIds: string[], connectionIds: string[]) => void;
  onPaneClick: () => void;
}) {
  const [initialNodes] = useState(() => mergeNodes([], workflow, schedule));
  const [initialEdges] = useState(() => makeEdges(workflow.connections, schedule));
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes((current) => mergeNodes(current, workflow, schedule));
  }, [workflow, schedule, setNodes]);

  useEffect(() => {
    setEdges((current) => {
      const byId = new Map(current.map((edge) => [edge.id, edge]));
      return makeEdges(workflow.connections, schedule).map((edge) => {
        const old = byId.get(edge.id);
        return old && old.animated === edge.animated && old.source === edge.source && old.target === edge.target
          ? old : { ...edge, selected: old?.selected };
      });
    });
  }, [workflow.connections, schedule, setEdges]);

  return (
    <ReactFlow
      className={workflow.steps.length >= 80 ? 'workflow-graph--large' : undefined}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onInit={onReady}
      onNodesChange={(changes) => {
        onNodesChange(changes);
        const positions = changes.flatMap((change) =>
          change.type === 'position' && change.position && !change.dragging
            ? [{ id: change.id, position: change.position }] : []);
        if (positions.length) onPositionsChange(positions);
      }}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_, node) => onStepSelect(node.id)}
      onPaneClick={onPaneClick}
      onEdgeClick={(_, edge) => onConnectionSelect(edge.id)}
      onDelete={({ nodes: deletedNodes, edges: deletedEdges }) =>
        onDelete(deletedNodes.map(({ id }) => id), deletedEdges.map(({ id }) => id))}
      nodesDraggable={editable}
      nodesConnectable={editable}
      elementsSelectable={editable}
      deleteKeyCode={editable ? deleteKeys : null}
      edgesReconnectable={false}
      fitView
      fitViewOptions={fitOptions}
      onlyRenderVisibleElements={workflow.steps.length >= 80}
      minZoom={0.18}
      maxZoom={1.75}
    >
      <Background color="rgba(150, 150, 155, .18)" gap={24} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

function mergeNodes(current: StepNode[], workflow: Workflow, schedule: WorkflowSchedule | null): StepNode[] {
  const byId = new Map(current.map((node) => [node.id, node]));
  const starts = new Set(schedule?.startingStepIds);
  const critical = new Set(schedule?.criticalPathStepIds);
  return workflow.steps.map((step) => {
    const old = byId.get(step.id);
    const timing = schedule?.stepTimings[step.id];
    const data: StepNodeData = {
      name: step.name,
      durationMinutes: step.durationMinutes,
      start: timing?.earliestStartMinutes,
      finish: timing?.earliestFinishMinutes,
      starting: starts.has(step.id),
      critical: critical.has(step.id),
    };
    const sameData = old && old.data.name === data.name && Object.is(old.data.durationMinutes, data.durationMinutes)
      && old.data.start === data.start && old.data.finish === data.finish
      && old.data.starting === data.starting && old.data.critical === data.critical;
    const position = old?.dragging ? old.position : step.position;
    if (old && sameData && old.position.x === position.x && old.position.y === position.y) return old;
    return { ...old, id: step.id, type: 'step', position, data: sameData ? old.data : data };
  });
}

function makeEdges(connections: Workflow['connections'], schedule: WorkflowSchedule | null): Edge[] {
  const criticalIds = new Set(schedule?.criticalPathConnectionIds);
  return connections.map((connection) => ({
    id: connection.id,
    source: connection.fromStepId,
    target: connection.toStepId,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    animated: criticalIds.has(connection.id),
    className: criticalIds.has(connection.id) ? 'workflow-edge--critical' : '',
  }));
}
