import type { WorkflowId, WorkflowMetadata } from '../../api/workflows.ts';
import { WorkflowPicker } from '../WorkflowPicker.tsx';

type WorkflowHeaderProps = {
  workflows: WorkflowMetadata[];
  workflowId: WorkflowId;
  canSwitch: boolean;
  saveStatus: string;
  onSwitch: (id: WorkflowId) => void;
};

export function WorkflowHeader({ workflows, workflowId, canSwitch, saveStatus, onSwitch }: WorkflowHeaderProps) {
  return (
    <header className="editor-header">
      <div className="editor-brand">
        <span className="editor-brand__mark" aria-hidden="true">P</span>
        <div><strong>Production flow</strong><span>Workflow editor</span></div>
      </div>
      <WorkflowPicker
        workflows={workflows}
        selectedId={workflowId}
        disabled={!canSwitch || !workflows.length}
        onSelect={onSwitch}
      />
      <div className="header-actions">
        <span className="save-state" role="status" data-saved={saveStatus === 'All changes saved'}>
          <i aria-hidden="true" />{saveStatus}
        </span>
      </div>
    </header>
  );
}
