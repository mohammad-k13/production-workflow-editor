import { useId, useState } from 'react';
import type { WorkflowStep } from '../../../shared/workflow/index.ts';

export function StepInspector({ step, nameError, durationError, focusName, onNameChange, onDurationChange,
  onFinishEdit, onClose, onDelete }: {
  step: WorkflowStep;
  nameError?: string;
  durationError?: string;
  focusName: boolean;
  onNameChange: (value: string) => void;
  onDurationChange: (value: number) => void;
  onFinishEdit: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const nameErrorId = useId();
  const durationErrorId = useId();
  const [durationDraft, setDurationDraft] = useState<{ text: string; minutes: number } | null>(null);
  const durationValue = durationDraft && Object.is(durationDraft.minutes, step.durationMinutes)
    ? durationDraft.text
    : Number.isNaN(step.durationMinutes) ? '' : String(step.durationMinutes);

  return (
    <aside className="step-inspector" aria-label={`Edit ${step.name || 'step'}`}>
      <div className="step-inspector__heading">
        <span>STEP DETAILS</span>
        <button className="icon-button" type="button" aria-label="Close step details" onClick={onClose}>×</button>
      </div>
      <label>
        Step name
        <input
          autoFocus={focusName}
          value={step.name}
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? nameErrorId : undefined}
          onBlur={onFinishEdit}
          onChange={(event) => onNameChange(event.target.value)}
        />
        {nameError && <span className="field-error" id={nameErrorId}>{nameError}</span>}
      </label>
      <label>
        Estimated time
        <span className="input-with-suffix">
          <input
            type="number"
            step="any"
            value={durationValue}
            aria-invalid={Boolean(durationError)}
            aria-describedby={durationError ? durationErrorId : undefined}
            onBlur={() => { setDurationDraft(null); onFinishEdit(); }}
            onChange={(event) => {
              const { value, valueAsNumber } = event.target;
              setDurationDraft({ text: value, minutes: valueAsNumber });
              onDurationChange(valueAsNumber);
            }}
          />
          <span>min</span>
        </span>
        {durationError && <span className="field-error" id={durationErrorId}>{durationError}</span>}
      </label>
      <button className="delete-step" type="button" onClick={onDelete}>Delete step</button>
    </aside>
  );
}
