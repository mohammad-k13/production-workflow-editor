import type { WorkflowId } from '../api/workflows.ts';
import { StepInspector } from '../components/StepInspector.tsx';
import { ConnectionActions } from '../components/editor/ConnectionActions.tsx';
import { WorkflowCanvas } from '../components/editor/WorkflowCanvas.tsx';
import { WorkflowFeedback } from '../components/editor/WorkflowFeedback.tsx';
import { WorkflowHeader } from '../components/editor/WorkflowHeader.tsx';
import { WorkflowOverview } from '../components/editor/WorkflowOverview.tsx';
import { WorkflowToolbar } from '../components/editor/WorkflowToolbar.tsx';
import { useWorkflowSession } from '../useWorkflowSession.ts';
import { useWorkflowCatalog } from './useWorkflowCatalog.ts';
import { useWorkflowEditing } from './useWorkflowEditing.ts';

export function WorkflowEditor() {
  const session = useWorkflowSession();
  const catalog = useWorkflowCatalog();
  const { workflow, workflowId, editable, ready, analysis: { schedule, issues } } = session;
  const editing = useWorkflowEditing({
    workflow, workflowId, editable,
    undoCount: session.history.previous.length,
    dispatchHistory: session.dispatchHistory,
  });
  const { selectedStep, selectedStepIndex, selectedConnection } = editing;
  const invalidStepIndex = issues[0]?.path.match(/^steps\[(\d+)\]/)?.[1];
  const invalidStep = invalidStepIndex === undefined ? undefined : workflow.steps[Number(invalidStepIndex)];
  const workflowName = session.name || catalog.workflows.find(({ id }) => id === workflowId)?.name || 'Workflow';

  function switchWorkflow(id: WorkflowId) {
    void session.switchWorkflow(id).then((changed) => {
      if (changed) editing.clearGraph();
    });
  }

  function fieldError(field: 'name' | 'durationMinutes') {
    return issues.find(({ path }) => path === `steps[${selectedStepIndex}].${field}`)?.message;
  }

  return (
    <div className="editor-shell">
      <WorkflowHeader
        workflows={catalog.workflows}
        workflowId={workflowId}
        canSwitch={session.canSwitch}
        saveStatus={session.saveStatus}
        onSwitch={switchWorkflow}
      />
      <WorkflowToolbar
        workflowName={workflowName}
        editable={editable}
        canUndo={editing.canUndo}
        onUndo={editing.undo}
        onReset={editing.resetWorkflow}
        onAddStep={editing.addStep}
      />
      <WorkflowCanvas
        canvasRef={editing.canvasRef}
        workflowId={workflowId}
        loading={!ready && !session.loadError}
        graph={ready ? {
          workflow, schedule, editable,
          onReady: editing.setGraph,
          onConnect: editing.connect,
          onStepSelect: editing.selectStep,
          onConnectionSelect: editing.selectConnection,
          onPositionsChange: editing.moveSteps,
          onDelete: editing.deleteElements,
          onPaneClick: editing.clearSelection,
        } : null}
      >
        <WorkflowFeedback
          catalogError={catalog.error}
          loadError={session.loadError}
          saveError={session.saveError}
          graphError={editing.graphError}
          hasConflict={session.conflict}
          isSwitching={session.isSwitching}
          hasInvalidFields={ready && issues.length > 0}
          onRetryCatalog={catalog.retry}
          onRetryLoad={session.retryLoad}
          onRetrySave={session.retrySave}
          onLoadLatest={() => { void session.loadLatest(); }}
          onKeepMine={session.keepMine}
          onEditInvalidStep={invalidStep && !selectedStep ? () => editing.selectStep(invalidStep.id) : undefined}
        />
        {selectedConnection && editable && (
          <ConnectionActions onDelete={() => editing.deleteElements([], [selectedConnection.id])} />
        )}
        {selectedStep && editable && (
          <StepInspector
            key={selectedStep.id}
            step={selectedStep}
            focusName={editing.focusStepName}
            nameError={fieldError('name')}
            durationError={fieldError('durationMinutes')}
            onNameChange={(name) => editing.renameStep(selectedStep.id, name)}
            onDurationChange={(duration) => editing.changeStepDuration(selectedStep.id, duration)}
            onFinishEdit={editing.finishEdit}
            onClose={editing.clearSelection}
            onDelete={() => editing.deleteElements([selectedStep.id], [])}
          />
        )}
      </WorkflowCanvas>
      <WorkflowOverview workflow={workflow} schedule={schedule} ready={ready} />
    </div>
  );
}
