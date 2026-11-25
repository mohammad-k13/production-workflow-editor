import type { WorkflowSchedule } from '../../../../shared/workflow-schedule/index.ts';
import type { Workflow } from '../../../../shared/workflow/index.ts';
import { formatMinutes } from '../../formatMinutes.ts';

type WorkflowOverviewProps = {
  workflow: Workflow;
  schedule: WorkflowSchedule | null;
  ready: boolean;
};

export function WorkflowOverview({ workflow, schedule, ready }: WorkflowOverviewProps) {
  const stepNames = new Map(workflow.steps.map(({ id, name }) => [id, name]));
  const criticalPath = ready ? schedule?.criticalPathStepIds.map((id) => stepNames.get(id)).join(' → ') : undefined;

  return (
    <footer className="workflow-summary" aria-label="Workflow overview">
      <div className="summary-title"><strong>Workflow overview</strong></div>
      <div className="summary-metric">
        <span>TOTAL DURATION</span><strong>{formatMinutes(ready ? schedule?.totalDurationMinutes : undefined)}</strong>
      </div>
      <div className="summary-metric"><span>STEPS</span><strong>{ready ? workflow.steps.length : '—'}</strong></div>
      <div className="summary-metric"><span>CONNECTIONS</span><strong>{ready ? workflow.connections.length : '—'}</strong></div>
      <div className="summary-path">
        <span>CRITICAL PATH</span><strong title={criticalPath}>{ready && schedule ? (criticalPath || 'No steps') : '—'}</strong>
      </div>
    </footer>
  );
}
