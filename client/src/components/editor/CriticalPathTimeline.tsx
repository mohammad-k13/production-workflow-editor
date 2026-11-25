import { useId } from 'react';
import type { WorkflowSchedule } from '../../../../shared/workflow-schedule/index.ts';
import type { WorkflowStep } from '../../../../shared/workflow/index.ts';
import { formatDuration, formatMinutes } from '../../formatMinutes.ts';

export function CriticalPathTimeline({ steps, schedule }: {
  steps: WorkflowStep[];
  schedule: WorkflowSchedule | null;
}) {
  const titleId = useId();
  const stepsById = new Map(steps.map((step) => [step.id, step]));
  const path = schedule?.criticalPathStepIds.flatMap((id) => {
    const step = stepsById.get(id);
    const timing = schedule.stepTimings[id];
    return step && timing ? [{ step, timing }] : [];
  }) ?? [];

  return (
    <section className="critical-path">
      <h2 className="critical-path__title" id={titleId}>Critical path</h2>
      {path.length ? (
        <div className="critical-path__scroll" role="region" aria-labelledby={titleId} tabIndex={0}>
          <ol className="critical-path__track">
            {path.map(({ step, timing: { earliestStartMinutes, earliestFinishMinutes } }) => (
              <li className="critical-path__step" key={step.id}>
                <span className="critical-path__marker" aria-hidden="true" />
                <strong className="critical-path__name" title={step.name}>{step.name}</strong>
                <span className="critical-path__time" title={`${formatMinutes(earliestStartMinutes)} to ${formatMinutes(earliestFinishMinutes)}`}>
                  {formatDuration(earliestStartMinutes)} <span aria-hidden="true">→</span> {formatDuration(earliestFinishMinutes)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="critical-path__empty">{schedule ? 'No steps' : 'Timing unavailable'}</p>
      )}
    </section>
  );
}
