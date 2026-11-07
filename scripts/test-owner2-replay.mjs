import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { api, owner2Workspace, startTestServer } from "./owner2-test-utils.mjs";

const evidence = JSON.parse(
  readFileSync(new URL("../.next/owner2-e2e.json", import.meta.url), "utf8"),
);
assert.equal(evidence.completed, true, "Run the complete pipeline suite first");
const server = await startTestServer(await owner2Workspace());
try {
  const look = (await api(server.base, `/api/looks/${evidence.lookId}`)).data;
  const description = evidence.phases.find(
    (phase) => phase.kind === "inspiration_description",
  );
  const events = (
    await api(
      server.base,
      `/api/workflow-operations/${description.operationId}/events?after=0`,
    )
  ).data;
  const response = await fetch(
    `${server.base}/api/workflow-operations/${description.operationId}/events`,
    {
      headers: {
        accept: "text/event-stream",
        "last-event-id": events[0].eventId,
      },
    },
  );
  const stream = await response.text();
  assert.equal(response.status, 200);
  assert.ok(stream.includes("piece_completed"));
  assert.ok(!stream.includes("event: started"));
  const path = `/api/looks/${look.id}/outfit-options/fresh_alternative/regenerate`;
  const wrong = await api(server.base, path, "POST", {
    expectedRevision: look.revision,
    expectedOptionId: look.outfitOptions.find(
      (option) => option.optionType === "closest",
    ).id,
    inventoryMode: "sample",
    execute: false,
  });
  assert.equal(wrong.status, 409);
  const body = {
    expectedRevision: look.revision,
    expectedOptionId: look.outfitOptions.find(
      (option) => option.optionType === "fresh_alternative",
    ).id,
    inventoryMode: "sample",
    execute: false,
  };
  const first = await api(server.base, path, "POST", body);
  const second = await api(server.base, path, "POST", body);
  assert.equal(first.status, 200);
  assert.equal(second.data.id, first.data.id);
  const cancelled = await api(
    server.base,
    `/api/workflow-operations/${first.data.id}/cancel`,
    "POST",
    {},
  );
  assert.equal(cancelled.data.status, "cancelled");
  const replay = (
    await api(
      server.base,
      `/api/workflow-operations/${first.data.id}/events?after=0`,
    )
  ).data;
  assert.equal(replay.at(-1).type, "cancelled");
  console.log(
    JSON.stringify({
      suite: "owner2_replay_and_regeneration_guards",
      passed: [
        "sse_replay",
        "stale_option_rejected",
        "allocation_deduplicated",
        "cancel_event_replay",
      ],
      providerCalls: 0,
    }),
  );
} finally {
  server.stop();
}
