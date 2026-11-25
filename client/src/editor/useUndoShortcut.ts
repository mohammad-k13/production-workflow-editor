import { useEffect } from 'react';

export function useUndoShortcut(enabled: boolean, undo: () => void) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey ||
        !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;

      const target = event.target;
      if (target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select'))) return;

      event.preventDefault();
      if (!event.repeat) undo();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, undo]);
}
