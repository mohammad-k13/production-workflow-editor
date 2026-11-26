export function ConnectionActions({ onDelete }: { onDelete: () => void }) {
  return (
    <div className="connection-actions">
      <button type="button" onClick={onDelete}>Delete connection</button>
      <kbd>Delete</kbd>
    </div>
  );
}
