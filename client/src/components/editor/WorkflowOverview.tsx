import type { WorkflowSchedule } from '../../../../shared/workflow-schedule/index.ts';
import type { Workflow } from '../../../../shared/workflow/index.ts';
import { formatDuration, formatMinutes } from '../../formatMinutes.ts';
import { CriticalPathTimeline } from './CriticalPathTimeline.tsx';

type WorkflowOverviewProps = {
  workflow: Workflow;
  schedule: WorkflowSchedule | null;
  ready: boolean;
};

export function WorkflowOverview({ workflow, schedule, ready }: WorkflowOverviewProps) {
  const totalMinutes = ready ? schedule?.totalDurationMinutes : undefined;

  return (
    <footer className="workflow-summary" aria-label="Workflow overview">
      <div className="summary-stats">
        <div className="summary-title"><strong>Workflow overview</strong></div>
        <div className="summary-metrics">
          <div className="summary-metric">
            <span>TOTAL DURATION</span><strong title={formatMinutes(totalMinutes)}>{formatDuration(totalMinutes)}</strong>
          </div>
          <div className="summary-metric"><span>STEPS</span><strong>{ready ? workflow.steps.length : '—'}</strong></div>
          <div className="summary-metric"><span>CONNECTIONS</span><strong>{ready ? workflow.connections.length : '—'}</strong></div>
        </div>
      </div>
      <CriticalPathTimeline steps={workflow.steps} schedule={ready ? schedule : null} />
    </footer>
  );
}
