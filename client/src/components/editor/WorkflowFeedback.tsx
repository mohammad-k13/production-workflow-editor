type WorkflowFeedbackProps = {
  catalogError: string;
  loadError: string;
  saveError: string;
  graphError: string;
  hasConflict: boolean;
  isSwitching: boolean;
  hasInvalidFields: boolean;
  onRetryCatalog: () => void;
  onRetryLoad: () => void;
  onRetrySave: () => void;
  onLoadLatest: () => void;
  onKeepMine: () => void;
  onEditInvalidStep?: () => void;
};

export function WorkflowFeedback({
  catalogError, loadError, saveError, graphError, hasConflict, isSwitching, hasInvalidFields,
  onRetryCatalog, onRetryLoad, onRetrySave, onLoadLatest, onKeepMine, onEditInvalidStep,
}: WorkflowFeedbackProps) {
  return (
    <div className="canvas-feedback">
      {catalogError && <div role="alert">{catalogError} <button type="button" onClick={onRetryCatalog}>Retry list</button></div>}
      {loadError && !hasConflict && <div role="alert">{loadError} <button type="button" onClick={onRetryLoad}>Retry load</button></div>}
      {saveError && <div role="alert">{saveError} <button type="button" onClick={onRetrySave}>Retry save</button></div>}
      {hasConflict && (
        <div role="alert">
          {loadError || 'Another editor saved a newer version. Your edits are still here.'}
          <button type="button" disabled={isSwitching} onClick={onLoadLatest}>Load latest</button>
          <button type="button" disabled={isSwitching} onClick={onKeepMine}>Keep mine and save</button>
        </div>
      )}
      {hasInvalidFields && (
        <div role="alert">
          Fix invalid fields to resume autosave.
          {onEditInvalidStep && <button type="button" onClick={onEditInvalidStep}>Edit invalid step</button>}
        </div>
      )}
      {graphError && <div role="alert">{graphError}</div>}
    </div>
  );
}
