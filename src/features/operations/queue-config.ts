import "server-only";

export function queueConfigured(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(env.STYLORA_DISPATCH_SECRET ?? ""))
    return false;
  if (
    env.VERCEL === "1" &&
    /^dpl_[A-Za-z0-9]+$/.test(env.VERCEL_DEPLOYMENT_ID ?? "")
  )
    return true;
  if (
    env.STYLORA_QUEUE_TOKEN?.trim() &&
    /^dpl_[A-Za-z0-9]+$/.test(env.VERCEL_DEPLOYMENT_ID ?? "")
  )
    return true;
  if (
    env.NODE_ENV !== "development" ||
    env.VERCEL_DEPLOYMENT_ID ||
    !env.VERCEL_QUEUE_TOKEN?.trim()
  )
    return false;
  try {
    const url = new URL(env.VERCEL_QUEUE_BASE_URL ?? "");
    if (!/^\d+\.\d+\.\d+$/.test(env.VERCEL_CLI_VERSION ?? "")) return false;
    const version = (env.VERCEL_CLI_VERSION ?? "").split(".").map(Number);
    return (
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      (version[0] > 59 || (version[0] === 59 && version[1] >= 26))
    );
  } catch {
    return false;
  }
}
