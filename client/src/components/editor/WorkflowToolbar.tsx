type WorkflowToolbarProps = {
  workflowName: string;
  editable: boolean;
  canUndo: boolean;
  onUndo: () => void;
  onReset: () => void;
  onAddStep: () => void;
};

export function WorkflowToolbar({ workflowName, editable, canUndo, onUndo, onReset, onAddStep }: WorkflowToolbarProps) {
  return (
    <div className="editor-toolbar">
      <div><h1>{workflowName}</h1><p>Connect steps to define the production sequence.</p></div>
      <div className="toolbar-actions">
        <button
          className="button button--quiet"
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          title="Undo workflow edit (Ctrl+Z / Cmd+Z)"
          aria-keyshortcuts="Control+Z Meta+Z"
        >
          <span aria-hidden="true">↶</span> Undo
        </button>
        <button className="button button--quiet" type="button" disabled={!editable} onClick={onReset}>
          Reset workflow
        </button>
        <button className="button button--primary" type="button" disabled={!editable} onClick={onAddStep}>
          <span aria-hidden="true">＋</span> Add step
        </button>
      </div>
    </div>
  );
}
