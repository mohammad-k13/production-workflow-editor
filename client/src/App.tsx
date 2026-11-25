import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node as FlowNode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { exampleWorkflow } from '../../shared/example-workflow.ts';
import largeWorkflow from '../../shared/large-workflow.json' with { type: 'json' };
import { calculateSchedule, InvalidWorkflowError } from '../../shared/workflow-schedule/index.ts';
import type { Workflow, WorkflowStep } from '../../shared/workflow/index.ts';
import { listWorkflows, loadWorkflow, saveWorkflow, type WorkflowId, type WorkflowMetadata } from './api/workflows.ts';
import { MouseGlowBackground } from './components/ui/MouseGlowBackground.tsx';
import { createWorkflowHistory, workflowHistoryReducer } from './workflowHistory.ts';

type StepNodeData = { name: string; durationMinutes: number; selected?: boolean };

function StepNode({ data, selected }: { data: StepNodeData; selected: boolean }) {
  return (
    <article className={`step-node${selected ? ' step-node--selected' : ''}`}>
      <Handle type="target" position={Position.Left} aria-label="Connect from previous step" />
      <span className="step-node__eyebrow">WORKFLOW STEP</span>
      <strong className="step-node__name">{data.name}</strong>
      <span className="step-node__duration"><span aria-hidden="true">◷</span> {data.durationMinutes} min</span>
      <Handle type="source" position={Position.Right} aria-label="Connect to next step" />
    </article>
  );
}

function WorkflowPicker({ workflows, selectedId, disabled, onSelect }: {
  workflows: WorkflowMetadata[];
  selectedId: WorkflowId;
  disabled: boolean;
  onSelect: (id: WorkflowId) => void;
}) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const selected = workflows.find((workflow) => workflow.id === selectedId);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof globalThis.Node) || !pickerRef.current?.contains(target)) setOpen(false);
    };
    window.addEventListener('pointerdown', closeOnOutsideClick);
    return () => window.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open]);

  return (
    <div className="workflow-picker" ref={pickerRef} onKeyDown={(event) => {
      if (event.key === 'Escape') setOpen(false);
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && open) {
        event.preventDefault();
        const options = [...(pickerRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
        const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        options[(currentIndex + direction + options.length) % options.length]?.focus();
      }
    }}>
      <span>WORKFLOW</span>
      <button
        className="workflow-picker__trigger"
        type="button"
        aria-label="Select workflow"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.name ?? 'Choose workflow'}</span>
        <span className={`workflow-picker__chevron${open ? ' is-open' : ''}`} aria-hidden="true">⌄</span>
      </button>
      {open && <div className="workflow-picker__menu" role="listbox" aria-label="Workflows">
        {workflows.map((workflow) => (
          <button
            key={workflow.id}
            type="button"
            role="option"
            aria-selected={workflow.id === selectedId}
            className={`workflow-picker__option${workflow.id === selectedId ? ' is-selected' : ''}`}
            onClick={() => { onSelect(workflow.id); setOpen(false); }}
          >
            <span>{workflow.name}</span>
            {workflow.id === selectedId && <span aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>}
    </div>
  );
}

function WorkflowGraph({
  workflow,
  schedule,
  isLoaded,
  hasConflict,
  onConnect,
  onStepSelect,
  onConnectionSelect,
  onStepPositionsChange,
  onConnectionsDelete,
  onPaneClick,
}: {
  workflow: Workflow;
  schedule: ReturnType<typeof calculateSchedule> | null;
  isLoaded: boolean;
  hasConflict: boolean;
  onConnect: (connection: Connection) => void;
  onStepSelect: (stepId: string) => void;
  onConnectionSelect: (connectionId: string) => void;
  onStepPositionsChange: (nodes: FlowNode<StepNodeData>[]) => void;
  onConnectionsDelete: (connectionIds: string[]) => void;
  onPaneClick: () => void;
}) {
  const initialNodes = useRef<FlowNode<StepNodeData>[] | null>(null);
  const initialEdges = useRef<Edge[] | null>(null);
  initialNodes.current ??= workflow.steps.map((step) => ({
    id: step.id,
    type: 'step',
    position: step.position,
    data: { name: step.name, durationMinutes: step.durationMinutes },
  }));
  initialEdges.current ??= makeEdges(workflow, schedule);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode<StepNodeData>>(initialNodes.current);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges.current);

  useEffect(() => {
    setNodes((currentNodes) => workflow.steps.map((step) => {
      const current = currentNodes.find((node) => node.id === step.id);
      return {
        id: step.id,
        type: 'step',
        position: step.position,
        data: { name: step.name, durationMinutes: step.durationMinutes },
        selected: current?.selected,
        dragging: current?.dragging,
      };
    }));
  }, [workflow.steps, setNodes]);

  useEffect(() => {
    setEdges((currentEdges) => makeEdges(workflow, schedule).map((edge) => ({
      ...edge,
      selected: currentEdges.find((current) => current.id === edge.id)?.selected,
    })));
  }, [workflow, schedule, setEdges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_, node) => onStepSelect(node.id)}
      onNodeDragStop={(_, node, movedNodes) => onStepPositionsChange(movedNodes.length ? movedNodes : [node])}
      onPaneClick={onPaneClick}
      onEdgeClick={(_, edge) => onConnectionSelect(edge.id)}
      onEdgesDelete={(deleted) => onConnectionsDelete(deleted.map((edge) => edge.id))}
      nodesDraggable={isLoaded && !hasConflict}
      nodesConnectable={isLoaded && !hasConflict}
      elementsSelectable={isLoaded && !hasConflict}
      deleteKeyCode={['Backspace', 'Delete']}
      edgesReconnectable={false}
      fitView
      fitViewOptions={{ padding: 0.24 }}
      minZoom={0.25}
      maxZoom={1.5}
      connectionLineStyle={{ stroke: '#99999f', strokeWidth: 2 }}
    >
      <Background color="rgba(150, 150, 155, .18)" gap={24} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

function makeEdges(workflow: Workflow, schedule: ReturnType<typeof calculateSchedule> | null): Edge[] {
  return workflow.connections.map((connection) => ({
    id: connection.id,
    source: connection.fromStepId,
    target: connection.toStepId,
    type: 'smoothstep',
    animated: schedule?.criticalPathConnectionIds.includes(connection.id) ?? false,
    className: schedule?.criticalPathConnectionIds.includes(connection.id) ? 'workflow-edge--critical' : '',
    deletable: true,
  }));
}

const nodeTypes = { step: StepNode };
const initialWorkflows: Record<WorkflowId, Workflow> = {
  example: exampleWorkflow,
  large: largeWorkflow as Workflow,
};

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes} min`;
  if (remainingMinutes === 0) return `${hours} hr`;
  return `${hours} hr ${remainingMinutes} min`;
}

export function App() {
  const [history, dispatchHistory] = useReducer(workflowHistoryReducer, exampleWorkflow, createWorkflowHistory);
  const workflow = history.workflow;
  const [workflowId, setWorkflowId] = useState<WorkflowId>('example');
  const [workflowList, setWorkflowList] = useState<WorkflowMetadata[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);
  const [retrySequence, setRetrySequence] = useState(0);
  const [saveState, setSaveState] = useState<'loading' | 'saved' | 'saving' | 'error' | 'conflict'>('loading');
  const [saveError, setSaveError] = useState('');
  const workflowRef = useRef(workflow);
  const workflowIdRef = useRef(workflowId);
  const revisionByWorkflow = useRef(new Map<WorkflowId, number>());
  const savingByWorkflow = useRef(new Map<WorkflowId, boolean>());
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  workflowRef.current = workflow;
  workflowIdRef.current = workflowId;
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [graphError, setGraphError] = useState('');
  const [nextStepNumber, setNextStepNumber] = useState(1);
  const canEdit = isLoaded && !hasConflict && !isSwitching;
  const canUndo = canEdit && history.previous.length > 0;

  const undoWorkflow = useCallback(() => {
    if (!canUndo) return;
    dispatchHistory({ type: 'undo' });
    setIsDirty(true);
    setGraphError('');
  }, [canUndo]);

  useEffect(() => {
    const handleUndo = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey ||
        !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      const target = event.target;
      if (target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select'))) return;
      if (!canUndo) return;
      event.preventDefault();
      if (!event.repeat) undoWorkflow();
    };
    window.addEventListener('keydown', handleUndo);
    return () => window.removeEventListener('keydown', handleUndo);
  }, [canUndo, undoWorkflow]);

  useEffect(() => {
    let active = true;
    void listWorkflows().then((items) => {
      if (active) setWorkflowList(items);
    }).catch((error: unknown) => {
      if (active) {
        setSaveError(error instanceof Error ? error.message : 'Could not load workflows.');
        setSaveState('error');
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setIsLoaded(false);
    setSaveState('loading');
    setSaveError('');
    setIsDirty(false);
    setHasConflict(false);
    setSelectedStepId(null);
    setSelectedConnectionId(null);
    void loadWorkflow(workflowId).then((result) => {
      if (!active || workflowIdRef.current !== workflowId) return;
      dispatchHistory({ type: 'replace', workflow: result.workflow });
      revisionByWorkflow.current.set(workflowId, result.revision ?? 0);
      setIsLoaded(true);
      setSaveState('saved');
    }).catch((error: unknown) => {
      if (!active) return;
      setSaveError(error instanceof Error ? error.message : 'Could not load workflow.');
      setSaveState('error');
    });
    return () => { active = false; };
  }, [workflowId]);

  useEffect(() => {
    if (!isLoaded || !isDirty || hasConflict || isSwitching) return;
    const id = workflowId;
    const timer = window.setTimeout(() => {
      const saveTask = saveQueue.current.catch(() => undefined).then(async () => {
        if (workflowIdRef.current !== id || hasConflict) return;
        const snapshot = workflowRef.current;
        savingByWorkflow.current.set(id, true);
        setSaveState('saving');
        try {
          const result = await saveWorkflow(id, snapshot);
          revisionByWorkflow.current.set(id, result.revision);
          if (workflowIdRef.current !== id) return;
          if (result.status === 'superseded') {
            setHasConflict(true);
            setSaveState('conflict');
            return;
          }
          if (workflowRef.current === snapshot) {
            setIsDirty(false);
            setSaveState('saved');
            setSaveError('');
          }
        } catch (error) {
          if (workflowIdRef.current !== id) return;
          setSaveError(error instanceof Error ? error.message : 'Could not save workflow.');
          setSaveState('error');
        } finally {
          savingByWorkflow.current.set(id, false);
        }
      });
      saveQueue.current = saveTask;
    }, 550);
    return () => window.clearTimeout(timer);
  }, [workflow, workflowId, isLoaded, isDirty, hasConflict, isSwitching, retrySequence]);

  useEffect(() => {
    if (!isLoaded || isSwitching) return;
    const id = workflowId;
    const poll = window.setInterval(() => {
      if (savingByWorkflow.current.get(id)) return;
      void loadWorkflow(id).then((remote) => {
        if (workflowIdRef.current !== id) return;
        const knownRevision = revisionByWorkflow.current.get(id) ?? 0;
        const remoteRevision = remote.revision ?? knownRevision;
        if (remoteRevision <= knownRevision) return;
        revisionByWorkflow.current.set(id, remoteRevision);
        if (isDirty || workflowRef.current !== workflow) {
          setHasConflict(true);
          setSaveState('conflict');
          return;
        }
        dispatchHistory({ type: 'replace', workflow: remote.workflow });
        setSaveState('saved');
      }).catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(poll);
  }, [workflowId, isLoaded, isDirty, isSwitching, workflow]);

  const changeWorkflow = (update: (current: Workflow) => Workflow, group?: string) => {
    if (!canEdit) return;
    dispatchHistory({ type: 'edit', update, group });
    setIsDirty(true);
  };

  const switchWorkflow = async (nextId: WorkflowId) => {
    if (nextId === workflowId || !canEdit) return;
    if (isDirty && isLoaded) {
      setIsSwitching(true);
      setSaveState('saving');
      try {
        await saveQueue.current.catch(() => undefined);
        const result = await saveWorkflow(workflowId, workflowRef.current);
        revisionByWorkflow.current.set(workflowId, result.revision);
        if (result.status === 'superseded') {
          setHasConflict(true);
          setSaveState('conflict');
          return;
        }
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Save this workflow before switching.');
        setSaveState('error');
        return;
      } finally {
        setIsSwitching(false);
      }
    }
    setIsLoaded(false);
    setIsDirty(false);
    setWorkflowId(nextId);
  };

  const reloadRemoteWorkflow = async () => {
    const remote = await loadWorkflow(workflowId);
    revisionByWorkflow.current.set(workflowId, remote.revision ?? 0);
    dispatchHistory({ type: 'replace', workflow: remote.workflow });
    setIsDirty(false);
    setHasConflict(false);
    setSaveState('saved');
    setSaveError('');
  };

  const keepLocalWorkflow = () => {
    setHasConflict(false);
    setSaveState('saved');
    setIsDirty(true);
  };

  const schedule = useMemo(() => {
    try {
      return calculateSchedule(workflow);
    } catch (error) {
      return error instanceof InvalidWorkflowError ? null : null;
    }
  }, [workflow]);

  const selectedStep = workflow.steps.find((step) => step.id === selectedStepId) ?? null;
  const selectedConnection = workflow.connections.find((connection) => connection.id === selectedConnectionId);

  const updateStep = <Field extends 'name' | 'durationMinutes'>(
    stepId: string, field: Field, value: WorkflowStep[Field],
  ) => {
    const step = workflowRef.current.steps.find((item) => item.id === stepId);
    if (!step || step[field] === value) return;
    changeWorkflow((current) => ({
      ...current,
      steps: current.steps.map((item) => item.id === stepId ? { ...item, [field]: value } : item),
    }), JSON.stringify([stepId, field]));
  };

  const updateStepPositions = (movedNodes: FlowNode<StepNodeData>[]) => {
    const positions = new Map(movedNodes
      .filter(({ position }) => Number.isFinite(position.x) && Number.isFinite(position.y))
      .map(({ id, position }) => [id, position]));
    const moved = ({ id, position }: WorkflowStep) => {
      const next = positions.get(id);
      return next !== undefined && (next.x !== position.x || next.y !== position.y);
    };
    if (!workflowRef.current.steps.some(moved)) return;
    changeWorkflow((current) => ({
      ...current,
      steps: current.steps.map((step) => {
        const position = positions.get(step.id);
        return position && moved(step) ? { ...step, position } : step;
      }),
    }));
  };

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const next = {
      ...workflow,
      connections: [...workflow.connections, {
        id: `connection-${crypto.randomUUID()}`,
        fromStepId: connection.source,
        toStepId: connection.target,
      }],
    };
    try {
      calculateSchedule(next);
      changeWorkflow(() => next);
      setGraphError('');
    } catch {
      setGraphError('That connection would create a cycle.');
    }
  };

  const addStep = () => {
    const step: WorkflowStep = {
      id: `step-${crypto.randomUUID()}`,
      name: `New step ${nextStepNumber}`,
      durationMinutes: 10,
      position: { x: 100 + (nextStepNumber % 4) * 250, y: 280 + Math.floor(nextStepNumber / 4) * 150 },
    };
    changeWorkflow((current) => ({ ...current, steps: [...current.steps, step] }));
    setNextStepNumber((number) => number + 1);
    setSelectedStepId(step.id);
  };

  return (
    <main className="ascii-page" aria-label="Production workflow editor">
      <section className="glass-panel" aria-label="Workflow editor">
        <MouseGlowBackground />
        <div className="editor-shell">
          <header className="editor-header">
            <div className="editor-brand"><span className="editor-brand__mark">P</span><div><strong>Production flow</strong><span>Workflow editor</span></div></div>
            <WorkflowPicker workflows={workflowList} selectedId={workflowId} disabled={!canEdit} onSelect={(id) => { void switchWorkflow(id); }} />
            <div className="header-actions">
              <span className={`save-state save-state--${saveState}`}><i />{saveState === 'loading' ? 'Loading workflow' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : saveState === 'conflict' ? 'New changes from another editor' : 'All changes saved'}</span>
              {saveState === 'conflict' && <><button className="button button--quiet" type="button" onClick={() => { void reloadRemoteWorkflow(); }}>Load latest</button><button className="button button--quiet" type="button" onClick={keepLocalWorkflow}>Keep mine</button></>}
              {saveState === 'error' && <button className="button button--quiet" type="button" onClick={() => { setSaveError(''); setRetrySequence((sequence) => sequence + 1); }}>Retry</button>}
            </div>
          </header>

          <div className="editor-toolbar">
            <div><h1>{workflowList.find((item) => item.id === workflowId)?.name ?? 'Workflow'}</h1><p>Connect steps to define the production sequence.</p></div>
            <div className="toolbar-actions">
              <button className="button button--quiet" type="button" disabled={!canUndo} onClick={undoWorkflow} title="Undo workflow edit (Ctrl+Z / Cmd+Z)" aria-keyshortcuts="Control+Z Meta+Z">
                <span aria-hidden="true">↶</span> Undo
              </button>
              <button className="button button--quiet" type="button" disabled={!canEdit} onClick={() => { changeWorkflow(() => structuredClone(initialWorkflows[workflowId])); setSelectedStepId(null); }}>Reset workflow</button>
              <button className="button button--primary" type="button" disabled={!canEdit} onClick={addStep}><span aria-hidden="true">＋</span> Add step</button>
            </div>
          </div>

          <section className="workflow-canvas" aria-label="Workflow graph">
            <div className="canvas-topline"><span><i /> EDITING WORKFLOW</span><span>Drag between handles to connect steps</span></div>
            <WorkflowGraph
              key={`${workflowId}-${isLoaded}`}
              workflow={workflow}
              schedule={schedule}
              isLoaded={isLoaded && !isSwitching}
              hasConflict={hasConflict}
              onConnect={onConnect}
              onStepSelect={setSelectedStepId}
              onConnectionSelect={setSelectedConnectionId}
              onStepPositionsChange={updateStepPositions}
              onConnectionsDelete={(ids) => {
                const deletedIds = new Set(ids);
                changeWorkflow((current) => ({
                  ...current,
                  connections: current.connections.filter((connection) => !deletedIds.has(connection.id)),
                }));
                setSelectedConnectionId(null);
              }}
              onPaneClick={() => { setSelectedStepId(null); setSelectedConnectionId(null); }}
            />
            {selectedConnection && canEdit && (
              <div className="connection-actions">
                <span>Connection selected</span>
                <button
                  type="button"
                  onClick={() => {
                    changeWorkflow((current) => ({
                      ...current,
                      connections: current.connections.filter((connection) => connection.id !== selectedConnectionId),
                    }));
                    setSelectedConnectionId(null);
                  }}
                >
                  Delete connection
                </button>
                <kbd>Delete</kbd>
              </div>
            )}
            {graphError && <div className="canvas-error" role="alert">{graphError}</div>}
            {saveError && saveState === 'error' && <div className="canvas-error" role="alert">{saveError}</div>}
            {selectedStep && canEdit && <StepInspector step={selectedStep} onUpdate={updateStep}
              onFinishEdit={() => dispatchHistory({ type: 'finish-edit' })}
              onClose={() => setSelectedStepId(null)}
              onDelete={() => {
              changeWorkflow((current) => ({
                steps: current.steps.filter((step) => step.id !== selectedStep.id),
                connections: current.connections.filter((connection) => connection.fromStepId !== selectedStep.id && connection.toStepId !== selectedStep.id),
              }));
              setSelectedStepId(null);
            }} />}
            <div className="canvas-zoom-hint">⌘ scroll to zoom</div>
          </section>

          <footer className="workflow-summary">
            <div className="summary-title"><span className="summary-icon">↗</span><div><strong>Workflow overview</strong><span>Live schedule based on connected steps</span></div></div>
            <div className="summary-metric"><span>TOTAL DURATION</span><strong>{schedule ? formatDuration(schedule.totalDurationMinutes) : 'Unavailable'}</strong></div>
            <div className="summary-metric"><span>STEPS</span><strong>{workflow.steps.length}</strong></div>
            <div className="summary-metric"><span>CONNECTIONS</span><strong>{workflow.connections.length}</strong></div>
            <div className="summary-path"><span>CRITICAL PATH</span><strong>{schedule?.criticalPathStepIds.length ? schedule.criticalPathStepIds.map((id) => workflow.steps.find((step) => step.id === id)?.name).filter(Boolean).join('  →  ') : 'No path yet'}</strong></div>
          </footer>
        </div>
        <div className="glass-surface" aria-hidden="true" />
      </section>
    </main>
  );
}

function StepInspector({ step, onUpdate, onFinishEdit, onClose, onDelete }: {
  step: WorkflowStep;
  onUpdate: <Field extends 'name' | 'durationMinutes'>(stepId: string, field: Field, value: WorkflowStep[Field]) => void;
  onFinishEdit: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <aside className="step-inspector" aria-label={`Edit ${step.name}`} onPointerDown={(event) => event.stopPropagation()}>
      <div className="step-inspector__heading"><span>STEP DETAILS</span><button className="icon-button" type="button" aria-label="Close step details" onClick={onClose}>×</button></div>
      <label>Step name<input value={step.name} onBlur={onFinishEdit} onChange={(event) => onUpdate(step.id, 'name', event.target.value)} /></label>
      <label>Estimated time <span className="input-with-suffix"><input type="number" min="1" value={step.durationMinutes} onBlur={onFinishEdit} onChange={(event) => onUpdate(step.id, 'durationMinutes', Number(event.target.value))} /><span>min</span></span></label>
      <div className="step-inspector__note">This step takes <strong>{formatDuration(step.durationMinutes || 0)}</strong>.</div>
      <button className="delete-step" type="button" onClick={onDelete}>Delete step</button>
    </aside>
  );
}
