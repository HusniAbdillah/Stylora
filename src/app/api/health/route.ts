import { getConfigurationReadiness } from "@/lib/config/server";
import { workflowExecutorReadiness } from "@/features/operations/health";
import {
  AVATAR_PROMPT_VERSION,
  CAPSULE_PROMPT_VERSION,
  IMAGE_MODEL,
  TEXT_MODEL,
} from "@/features/ai/openai";

export async function GET() {
  const readiness = getConfigurationReadiness();
  const executor = await workflowExecutorReadiness(
    readiness.databaseConfigured,
  );
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
  const available =
    readiness.databaseConfigured &&
    (!readiness.writesEnabled ||
      (executor.configured && readiness.modelConfigured));
  const data = {
    ...readiness,
    executor,
    runtime: {
      version: "workflow-runtime.v1",
      commit: /^[a-f0-9]{40}$/.test(commit) ? commit : null,
      avatarPromptVersion: AVATAR_PROMPT_VERSION,
      capsulePromptVersion: CAPSULE_PROMPT_VERSION,
      imageModel: IMAGE_MODEL,
      textModel: TEXT_MODEL,
    },
  };

  return Response.json(
    available
      ? { data }
      : {
          data,
          error: {
            code: !readiness.databaseConfigured
              ? "WORKSPACE_CONFIGURATION_UNAVAILABLE"
              : (executor.errorCode ?? "MODEL_UNCONFIGURED"),
            message: "Application execution is unavailable.",
            retryable: true,
          },
        },
    {
      status: available ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
