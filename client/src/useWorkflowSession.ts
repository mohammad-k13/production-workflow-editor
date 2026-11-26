import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { calculateSchedule, InvalidWorkflowError } from '../../shared/workflow-schedule/index.ts';
import type { Workflow } from '../../shared/workflow/index.ts';
import { loadWorkflow, saveWorkflow, type LoadedWorkflow, type WorkflowId } from './api/workflows.ts';
import { createWorkflowHistory, workflowHistoryReducer } from './workflowHistory.ts';

const emptyWorkflow: Workflow = { steps: [], connections: [] };
const saveDelayMs = 550;
const pollIntervalMs = 2000;

export function useWorkflowSession() {
  const [workflowId, setWorkflowId] = useState<WorkflowId>('example');
  const [history, dispatchHistory] = useReducer(workflowHistoryReducer, emptyWorkflow, createWorkflowHistory);
  const [saved, setSaved] = useState<LoadedWorkflow | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [conflictVersion, setConflictVersion] = useState('');
  const busy = useRef(false);
  const workflow = history.workflow;
  const ready = saved?.id === workflowId;
  const dirty = ready && workflow !== saved.workflow;
  const editable = ready && !isSwitching && !conflictVersion;
  const analysis = useMemo(() => {
    try {
      return { schedule: calculateSchedule(workflow), issues: [] };
    } catch (error) {
      if (!(error instanceof InvalidWorkflowError)) throw error;
      return { schedule: null, issues: error.issues };
    }
  }, [workflow]);

  const adopt = useCallback((loaded: LoadedWorkflow) => {
    dispatchHistory({ type: 'replace', workflow: loaded.workflow });
    setSaved(loaded);
    setLoadError('');
    setSaveError('');
    setConflictVersion('');
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadWorkflow(workflowId, controller.signal).then((loaded) => {
      if (!controller.signal.aborted) adopt(loaded);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadError(errorMessage(error, 'Could not load the workflow.'));
    });
    return () => controller.abort();
  }, [workflowId, loadAttempt, adopt]);

  const saveSnapshot = useCallback(async (base: LoadedWorkflow, snapshot: Workflow): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setIsSaving(true);
    setSaveError('');
    try {
      const result = await saveWorkflow(base.id, snapshot, base.version);
      if (result.status === 'conflict') {
        setConflictVersion(result.version);
        return false;
      }
      setSaved({ ...base, version: result.version, workflow: snapshot });
      return true;
    } catch (error) {
      setSaveError(errorMessage(error, 'Could not save the workflow.'));
      return false;
    } finally {
      busy.current = false;
      setIsSaving(false);
    }
  }, []);

  useEffect(() => {
    if (!editable || !saved || !dirty || !analysis.schedule || saveError || isSaving) return;
    const timer = window.setTimeout(() => { void saveSnapshot(saved, workflow); }, saveDelayMs);
    return () => window.clearTimeout(timer);
  }, [editable, saved, dirty, analysis.schedule, saveError, isSaving, workflow, saveSnapshot]);

  useEffect(() => {
    if (!editable || !saved || dirty || isSaving) return;
    const controller = new AbortController();
    let pending = false;
    const timer = window.setInterval(() => {
      if (pending) return;
      pending = true;
      void loadWorkflow(saved.id, controller.signal).then((remote) => {
        if (!controller.signal.aborted && remote.version !== saved.version) adopt(remote);
      }).catch(() => {
        // A failed background refresh should not replace usable editor data.
      }).finally(() => { pending = false; });
    }, pollIntervalMs);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [editable, saved, dirty, isSaving, adopt]);

  async function switchWorkflow(nextId: WorkflowId): Promise<boolean> {
    if (nextId === workflowId || conflictVersion || isSwitching || busy.current) return false;
    if (dirty && saved) {
      if (!analysis.schedule) return false;
      setIsSwitching(true);
      try {
        if (!await saveSnapshot(saved, workflow)) return false;
      } finally {
        setIsSwitching(false);
      }
    }
    setSaved(null);
    setLoadError('');
    setSaveError('');
    setWorkflowId(nextId);
    return true;
  }

  function keepMine() {
    if (!saved || !conflictVersion) return;
    // Save against the version the conflict reported. If someone writes
    // again first, saving returns another conflict.
    setSaved({ ...saved, version: conflictVersion });
    setConflictVersion('');
    setSaveError('');
  }

  async function loadLatest() {
    if (busy.current) return;
    busy.current = true;
    setIsSwitching(true);
    setLoadError('');
    try {
      adopt(await loadWorkflow(workflowId));
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load the latest workflow.'));
    } finally {
      busy.current = false;
      setIsSwitching(false);
    }
  }

  function retryLoad() {
    setLoadError('');
    setLoadAttempt((attempt) => attempt + 1);
  }

  const saveStatus = !ready ? (loadError ? 'Load failed' : 'Loading workflow…')
    : conflictVersion ? 'Save conflict'
      : !analysis.schedule ? 'Invalid changes'
        : isSaving ? 'Saving…'
          : saveError ? 'Save failed'
            : dirty ? 'Unsaved changes' : 'All changes saved';

  return {
    workflowId, workflow, ready, editable: Boolean(editable), name: ready ? saved.name : '',
    analysis, history, dispatchHistory, saveStatus, loadError, saveError,
    conflict: Boolean(conflictVersion), isSaving, isSwitching,
    canSwitch: !conflictVersion && !isSaving && !isSwitching && (!dirty || Boolean(analysis.schedule)),
    switchWorkflow, retryLoad, loadLatest, keepMine,
    retrySave: () => setSaveError(''),
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
