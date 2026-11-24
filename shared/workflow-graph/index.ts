export type TopologicalOrder = {
  stepIds: string[];
  hasCycle: boolean;
};

/**
 * Returns a stable topological order for a graph whose IDs and edge endpoints
 * have already been structurally validated.
 */
export function topologicallyOrderStepIds(
  stepIds: readonly string[],
  connections: readonly { fromStepId: string; toStepId: string }[],
): TopologicalOrder {
  const incomingCount = new Map<string, number>();
  const outgoingByStepId = new Map<string, string[]>();

  for (const stepId of stepIds) {
    incomingCount.set(stepId, 0);
    outgoingByStepId.set(stepId, []);
  }

  for (const connection of connections) {
    incomingCount.set(
      connection.toStepId,
      (incomingCount.get(connection.toStepId) ?? 0) + 1,
    );
    outgoingByStepId.get(connection.fromStepId)?.push(connection.toStepId);
  }

  const queue = stepIds.filter((stepId) => incomingCount.get(stepId) === 0);
  const orderedStepIds: string[] = [];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const stepId = queue[cursor];
    orderedStepIds.push(stepId);

    for (const nextStepId of outgoingByStepId.get(stepId) ?? []) {
      const remainingIncoming = (incomingCount.get(nextStepId) ?? 0) - 1;
      incomingCount.set(nextStepId, remainingIncoming);
      if (remainingIncoming === 0) {
        queue.push(nextStepId);
      }
    }
  }

  return {
    stepIds: orderedStepIds,
    hasCycle: orderedStepIds.length !== stepIds.length,
  };
}
