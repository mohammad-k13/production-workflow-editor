import { useEffect, useState } from 'react';
import { listWorkflows, type WorkflowMetadata } from '../api/workflows.ts';

export function useWorkflowCatalog() {
  const [workflows, setWorkflows] = useState<WorkflowMetadata[]>([]);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void listWorkflows(controller.signal).then((items) => {
      if (!controller.signal.aborted) setWorkflows(items);
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : 'Could not load the workflow list.');
      }
    });
    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setError('');
    setAttempt((value) => value + 1);
  }

  return { workflows, error, retry };
}
