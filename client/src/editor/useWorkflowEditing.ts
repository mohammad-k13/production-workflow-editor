import { useCallback, useRef, useState, type Dispatch } from 'react';
import type { Connection } from '@xyflow/react';
import { exampleWorkflow } from '../../../shared/example-workflow.ts';
import largeWorkflow from '../../../shared/large-workflow.json' with { type: 'json' };
import { validateWorkflow } from '../../../shared/workflow-validation/index.ts';
import type { Workflow } from '../../../shared/workflow/index.ts';
import type { WorkflowId } from '../api/workflows.ts';
import type { GraphInstance, StepPosition } from '../components/WorkflowGraph.tsx';
import type { WorkflowHistoryAction } from '../workflowHistory.ts';
import { useUndoShortcut } from './useUndoShortcut.ts';

const initialWorkflows: Record<WorkflowId, Workflow> = { example: exampleWorkflow, large: largeWorkflow };

type Selection =
  | { type: 'step'; id: string; focusName: boolean }
  | { type: 'connection'; id: string }
  | null;

type EditingOptions = {
  workflow: Workflow;
  workflowId: WorkflowId;
  editable: boolean;
  undoCount: number;
  dispatchHistory: Dispatch<WorkflowHistoryAction>;
};

export function useWorkflowEditing({ workflow, workflowId, editable, undoCount, dispatchHistory }: EditingOptions) {
  const [selection, setSelection] = useState<Selection>(null);
  const [graphError, setGraphError] = useState('');
  const [nextStepNumber, setNextStepNumber] = useState(1);
  const graph = useRef<GraphInstance | null>(null);
  const canvasRef = useRef<HTMLElement | null>(null);
  const canUndo = editable && undoCount > 0;
  const selectedStepIndex = selection?.type === 'step'
    ? workflow.steps.findIndex(({ id }) => id === selection.id) : -1;
  const selectedStep = workflow.steps[selectedStepIndex];
  const selectedConnection = selection?.type === 'connection'
    ? workflow.connections.find(({ id }) => id === selection.id) : undefined;

  const undo = useCallback(() => {
    if (!canUndo) return;
    dispatchHistory({ type: 'undo' });
    setGraphError('');
  }, [canUndo, dispatchHistory]);
  useUndoShortcut(canUndo, undo);

  const setGraph = useCallback((instance: GraphInstance) => {
    graph.current = instance;
  }, []);

  function edit(update: (current: Workflow) => Workflow, group?: string) {
    if (!editable) return;
    dispatchHistory({ type: 'edit', update, group });
    setGraphError('');
  }

  function clearSelection() {
    setSelection(null);
  }

  function clearGraph() {
    graph.current = null;
    clearSelection();
    setGraphError('');
  }

  function selectStep(id: string) {
    setSelection({ type: 'step', id, focusName: false });
  }

  function selectConnection(id: string) {
    setSelection({ type: 'connection', id });
  }

  function resetWorkflow() {
    edit(() => structuredClone(initialWorkflows[workflowId]));
    clearSelection();
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
    const bounds = canvasRef.current?.getBoundingClientRect();
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
    setSelection({ type: 'step', id: step.id, focusName: true });
  }

  function renameStep(id: string, name: string) {
    edit((current) => ({
      ...current,
      steps: current.steps.map((step) => step.id === id && step.name !== name ? { ...step, name } : step),
    }), `${id}:name`);
  }

  function changeStepDuration(id: string, durationMinutes: number) {
    edit((current) => ({
      ...current,
      steps: current.steps.map((step) => step.id === id && !Object.is(step.durationMinutes, durationMinutes)
        ? { ...step, durationMinutes } : step),
    }), `${id}:duration`);
  }

  return {
    addStep, canUndo, canvasRef, changeStepDuration, clearGraph, clearSelection, connect, deleteElements,
    finishEdit: () => dispatchHistory({ type: 'finish-edit' }),
    focusStepName: selection?.type === 'step' && selection.focusName,
    graphError, moveSteps, renameStep, resetWorkflow, selectConnection, selectedConnection,
    selectedStep, selectedStepIndex, selectStep, setGraph, undo,
  };
}
