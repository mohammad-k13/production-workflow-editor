import { useCallback, useEffect, useRef, useState } from 'react';
import type { Connection } from '@xyflow/react';
import { exampleWorkflow } from '../../shared/example-workflow.ts';
import largeWorkflow from '../../shared/large-workflow.json' with { type: 'json' };
import { validateWorkflow } from '../../shared/workflow-validation/index.ts';
import type { Workflow } from '../../shared/workflow/index.ts';
import { listWorkflows, type WorkflowId, type WorkflowMetadata } from './api/workflows.ts';
import { StepInspector } from './components/StepInspector.tsx';
import { WorkflowGraph, type GraphInstance, type StepPosition } from './components/WorkflowGraph.tsx';
import { WorkflowPicker } from './components/WorkflowPicker.tsx';
import { MouseGlowBackground } from './components/ui/MouseGlowBackground.tsx';
import { formatMinutes } from './formatMinutes.ts';
import { useWorkflowSession } from './useWorkflowSession.ts';

const initialWorkflows: Record<WorkflowId, Workflow> = { example: exampleWorkflow, large: largeWorkflow };

export function App() {
  const session = useWorkflowSession();
  const { workflow, editable, analysis: { schedule, issues }, dispatchHistory } = session;
  const [catalog, setCatalog] = useState<WorkflowMetadata[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [focusStepId, setFocusStepId] = useState<string | null>(null);
  const [graphError, setGraphError] = useState('');
  const [nextStepNumber, setNextStepNumber] = useState(1);
  const graph = useRef<GraphInstance | null>(null);
  const canvas = useRef<HTMLElement | null>(null);
  const canUndo = editable && session.history.previous.length > 0;

  useEffect(() => {
    const controller = new AbortController();
    void listWorkflows(controller.signal).then((items) => {
      if (!controller.signal.aborted) setCatalog(items);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setCatalogError(error instanceof Error ? error.message : 'Could not load the workflow list.');
      }
    });
    return () => controller.abort();
  }, [catalogAttempt]);

  const undo = useCallback(() => {
    if (!canUndo) return;
    dispatchHistory({ type: 'undo' });
    setGraphError('');
  }, [canUndo, dispatchHistory]);

  useEffect(() => {
    function handleUndo(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey ||
        !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      const target = event.target;
      if (target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select'))) return;
      if (!canUndo) return;
      event.preventDefault();
      if (!event.repeat) undo();
    }
    window.addEventListener('keydown', handleUndo);
    return () => window.removeEventListener('keydown', handleUndo);
  }, [canUndo, undo]);

  function edit(update: (current: Workflow) => Workflow, group?: string) {
    if (!editable) return;
    dispatchHistory({ type: 'edit', update, group });
    setGraphError('');
  }

  function clearSelection() {
    setSelectedStepId(null);
    setSelectedConnectionId(null);
    setFocusStepId(null);
  }

  function deleteElements(stepIds: string[], connectionIds: string[]) {
    const steps = new Set(stepIds);
    const connections = new Set(connectionIds);
    edit((current) => ({
      steps: current.steps.filter((step) => !steps.has(step.id)),
      connections: current.connections.filter(({ id, fromStepId, toStepId }) =>
        !connections.has(id) && !steps.has(fromStepId) && !steps.has(toStepId)),
    }));
    clearSelection();
  }

  function moveSteps(changes: StepPosition[]) {
    const positions = new Map(changes
      .filter(({ position }) => Number.isFinite(position.x) && Number.isFinite(position.y))
      .map(({ id, position }) => [id, position]));
    edit((current) => {
      let updated = false;
      const steps = current.steps.map((step) => {
        const position = positions.get(step.id);
        if (!position || (position.x === step.position.x && position.y === step.position.y)) return step;
        updated = true;
        return { ...step, position };
      });
      return updated ? { ...current, steps } : current;
    });
  }

  function connect({ source, target }: Connection) {
    if (!editable || !source || !target) return;
    const connection = { id: crypto.randomUUID(), fromStepId: source, toStepId: target };
    const candidate = { ...workflow, connections: [...workflow.connections, connection] };
    const validation = validateWorkflow(candidate);
    if (!validation.valid) {
      setGraphError(validation.issues.find(({ code }) => code === 'workflow_cycle')?.message
        ?? 'Fix the invalid step fields before connecting steps.');
      return;
    }
    edit((current) => ({ ...current, connections: [...current.connections, connection] }));
  }

  function addStep() {
    if (!editable) return;
    const bounds = canvas.current?.getBoundingClientRect();
    const position = bounds && graph.current
      ? graph.current.screenToFlowPosition({
        x: bounds.left + Math.max(20, bounds.width * 0.38 - 80),
        y: bounds.top + Math.max(45, bounds.height * 0.40 - 40),
      })
      : { x: 0, y: 0 };
    const step = {
      id: crypto.randomUUID(),
      name: `New step ${nextStepNumber}`,
      durationMinutes: 10,
      position,
    };
    edit((current) => ({ ...current, steps: [...current.steps, step] }));
    setNextStepNumber((number) => number + 1);
    setSelectedConnectionId(null);
    setSelectedStepId(step.id);
    setFocusStepId(step.id);
  }

  const selectedIndex = workflow.steps.findIndex((step) => step.id === selectedStepId);
  const selectedStep = workflow.steps[selectedIndex];
  const selectedConnection = workflow.connections.find(({ id }) => id === selectedConnectionId);
  const invalidStep = issues[0]?.path.match(/^steps\[(\d+)\]/)?.[1];
  const stepNames = new Map(workflow.steps.map(({ id, name }) => [id, name]));
  const criticalPath = schedule?.criticalPathStepIds.map((id) => stepNames.get(id)).join(' → ');
  const workflowName = session.name || catalog.find(({ id }) => id === session.workflowId)?.name || 'Workflow';

  return (
    <main className="ascii-page" aria-label="Production workflow editor">
      <section className="glass-panel" aria-label="Workflow editor">
        <MouseGlowBackground />
        <div className="editor-shell">
          <header className="editor-header">
            <div className="editor-brand">
              <span className="editor-brand__mark" aria-hidden="true">P</span>
              <div><strong>Production flow</strong><span>Workflow editor</span></div>
            </div>
            <WorkflowPicker
              workflows={catalog}
              selectedId={session.workflowId}
              disabled={!session.canSwitch || !catalog.length}
              onSelect={(id) => {
                void session.switchWorkflow(id).then((changed) => {
                  if (changed) {
                    graph.current = null;
                    clearSelection();
                    setGraphError('');
                  }
                });
              }}
            />
            <div className="header-actions">
              <span className="save-state" role="status" data-saved={session.saveStatus === 'All changes saved'}>
                <i aria-hidden="true" />{session.saveStatus}
              </span>
            </div>
          </header>

          <div className="editor-toolbar">
            <div><h1>{workflowName}</h1><p>Connect steps to define the production sequence.</p></div>
            <div className="toolbar-actions">
              <button className="button button--quiet" type="button" disabled={!canUndo} onClick={undo}
                title="Undo workflow edit (Ctrl+Z / Cmd+Z)" aria-keyshortcuts="Control+Z Meta+Z">
                <span aria-hidden="true">↶</span> Undo
              </button>
              <button className="button button--quiet" type="button" disabled={!editable} onClick={() => {
                edit(() => structuredClone(initialWorkflows[session.workflowId]));
                clearSelection();
              }}>Reset workflow</button>
              <button className="button button--primary" type="button" disabled={!editable} onClick={addStep}>
                <span aria-hidden="true">＋</span> Add step
              </button>
            </div>
          </div>

          <section className="workflow-canvas" ref={canvas} aria-label="Workflow graph" aria-busy={!session.ready && !session.loadError}>
            {session.ready && (
              <WorkflowGraph
                key={session.workflowId}
                workflow={workflow}
                schedule={schedule}
                editable={editable}
                onReady={(instance) => { graph.current = instance; }}
                onConnect={connect}
                onStepSelect={(id) => {
                  setSelectedStepId(id);
                  setSelectedConnectionId(null);
                  setFocusStepId(null);
                }}
                onConnectionSelect={(id) => {
                  setSelectedConnectionId(id);
                  setSelectedStepId(null);
                }}
                onPositionsChange={moveSteps}
                onDelete={deleteElements}
                onPaneClick={clearSelection}
              />
            )}
            <div className="canvas-feedback">
              {catalogError && <div role="alert">{catalogError} <button type="button" onClick={() => {
                setCatalogError('');
                setCatalogAttempt((attempt) => attempt + 1);
              }}>Retry list</button></div>}
              {session.loadError && !session.conflict && <div role="alert">{session.loadError} <button type="button" onClick={session.retryLoad}>Retry load</button></div>}
              {session.saveError && <div role="alert">{session.saveError} <button type="button" onClick={session.retrySave}>Retry save</button></div>}
              {session.conflict && <div role="alert">
                {session.loadError || 'Another editor saved a newer version. Your edits are still here.'}
                <button type="button" disabled={session.isSwitching} onClick={() => { void session.loadLatest(); }}>Load latest</button>
                <button type="button" disabled={session.isSwitching} onClick={session.keepMine}>Keep mine and save</button>
              </div>}
              {session.ready && issues.length > 0 && <div role="alert">
                Fix invalid fields to resume autosave.
                {invalidStep !== undefined && !selectedStep && <button type="button" onClick={() => {
                  setSelectedStepId(workflow.steps[Number(invalidStep)]?.id ?? null);
                }}>Edit invalid step</button>}
              </div>}
              {graphError && <div role="alert">{graphError}</div>}
            </div>
            {selectedConnection && editable && (
              <div className="connection-actions">
                <button type="button" onClick={() => deleteElements([], [selectedConnection.id])}>Delete connection</button>
                <kbd>Delete</kbd>
              </div>
            )}
            {selectedStep && editable && (
              <StepInspector
                key={selectedStep.id}
                step={selectedStep}
                focusName={focusStepId === selectedStep.id}
                nameError={issues.find(({ path }) => path === `steps[${selectedIndex}].name`)?.message}
                durationError={issues.find(({ path }) => path === `steps[${selectedIndex}].durationMinutes`)?.message}
                onNameChange={(name) => edit((current) => ({
                  ...current,
                  steps: current.steps.map((step) => step.id === selectedStep.id && step.name !== name
                    ? { ...step, name } : step),
                }), `${selectedStep.id}:name`)}
                onDurationChange={(durationMinutes) => edit((current) => ({
                  ...current,
                  steps: current.steps.map((step) => step.id === selectedStep.id && !Object.is(step.durationMinutes, durationMinutes)
                    ? { ...step, durationMinutes } : step),
                }), `${selectedStep.id}:duration`)}
                onFinishEdit={() => dispatchHistory({ type: 'finish-edit' })}
                onClose={clearSelection}
                onDelete={() => deleteElements([selectedStep.id], [])}
              />
            )}
          </section>

          <footer className="workflow-summary" aria-label="Workflow overview">
            <div className="summary-title"><strong>Workflow overview</strong></div>
            <div className="summary-metric"><span>TOTAL DURATION</span><strong>{session.ready && schedule ? formatMinutes(schedule.totalDurationMinutes) : '—'}</strong></div>
            <div className="summary-metric"><span>STEPS</span><strong>{session.ready ? workflow.steps.length : '—'}</strong></div>
            <div className="summary-metric"><span>CONNECTIONS</span><strong>{session.ready ? workflow.connections.length : '—'}</strong></div>
            <div className="summary-path"><span>CRITICAL PATH</span><strong title={criticalPath}>{session.ready && schedule ? (criticalPath || 'No steps') : '—'}</strong></div>
          </footer>
        </div>
        <div className="glass-surface" aria-hidden="true" />
      </section>
    </main>
  );
}
