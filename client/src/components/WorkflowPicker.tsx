import { useEffect, useId, useRef, useState } from 'react';
import type { WorkflowId, WorkflowMetadata } from '../api/workflows.ts';

export function WorkflowPicker({ workflows, selectedId, disabled, onSelect }: {
  workflows: WorkflowMetadata[];
  selectedId: WorkflowId;
  disabled: boolean;
  onSelect: (id: WorkflowId) => void;
}) {
  const [open, setOpen] = useState(false);
  const picker = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = workflows.find(({ id }) => id === selectedId);
  const expanded = open && !disabled;

  useEffect(() => {
    if (!expanded) return;
    picker.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    function closeOnOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !picker.current?.contains(event.target)) setOpen(false);
    }
    window.addEventListener('pointerdown', closeOnOutsideClick);
    return () => window.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [expanded]);

  return (
    <div className="workflow-picker" ref={picker} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => {
      if (event.key === 'Escape' && expanded) {
        setOpen(false);
        trigger.current?.focus();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      if (disabled) return;
      event.preventDefault();
      if (!expanded) {
        setOpen(true);
        return;
      }
      const options = Array.from(picker.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
      if (!options.length) return;
      const current = options.findIndex((option) => option === document.activeElement);
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      options[(current + direction + options.length) % options.length]?.focus();
    }}>
      <span>WORKFLOW</span>
      <button
        className="workflow-picker__trigger"
        ref={trigger}
        type="button"
        aria-label={`Select workflow${selected ? `: ${selected.name}` : ''}`}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{selected?.name ?? 'Choose workflow'}</span>
        <span className={`workflow-picker__chevron${expanded ? ' is-open' : ''}`} aria-hidden="true">⌄</span>
      </button>
      {expanded && (
        <div className="workflow-picker__menu" id={listId} role="listbox" aria-label="Workflows">
          {workflows.map((workflow) => {
            const isSelected = workflow.id === selectedId;
            return (
              <button
                key={workflow.id}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={isSelected}
                className={`workflow-picker__option${isSelected ? ' is-selected' : ''}`}
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                  onSelect(workflow.id);
                }}
              >
                <span>{workflow.name}</span>
                {isSelected && <span aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
