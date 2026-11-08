import "server-only";
import { apiRoute } from "@/lib/api";
import { operationResponse } from "./http";
import { readOperation, type Operation } from "./server";

const studioKinds = new Set([
  "capsule_generation",
  "preview_image",
  "saved_avatar",
  "wardrobe_description",
]);

export async function dispatchOperation(
  operationId: string,
  studio: (operation: Operation) => Promise<unknown>,
  legacy: () => Promise<unknown>,
): Promise<Response> {
  let operation: Operation;
  try {
    operation = await readOperation(operationId);
  } catch {
    return apiRoute(legacy);
  }
  if (!studioKinds.has(operation.kind)) return apiRoute(legacy);
  return operationResponse(() => studio(operation));
}
