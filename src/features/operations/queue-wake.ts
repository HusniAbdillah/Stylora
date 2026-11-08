import "server-only";
import { after } from "next/server";
import { workflowExecutionMode } from "./execution-mode";
import { publishWorkflowDispatches } from "./queue-publish";

export function scheduleWorkflowDispatch() {
  if (workflowExecutionMode() !== "queue") return;
  // The transactional outbox and repair schedule survive a lost after callback.
  after(async () => {
    try {
      await publishWorkflowDispatches();
    } catch {
      console.warn(JSON.stringify({ event: "workflow_dispatch_deferred" }));
    }
  });
}
