import { operationResponse } from "@/features/operations/http";
import { readOperationActivity } from "@/features/operations/activity";

export async function GET(request: Request) {
  return operationResponse(() =>
    readOperationActivity(
      Object.fromEntries(new URL(request.url).searchParams),
    ),
  );
}
