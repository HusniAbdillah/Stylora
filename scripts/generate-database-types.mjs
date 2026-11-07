import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const projectId = process.env.SUPABASE_PROJECT_ID;
if (!projectId || !/^[a-z0-9]{20}$/.test(projectId)) {
  console.error(
    "Set SUPABASE_PROJECT_ID to the approved hosted project reference.",
  );
  process.exit(1);
}

const packageFile = new URL(
  "../node_modules/supabase/package.json",
  import.meta.url,
);
const { bin } = JSON.parse(readFileSync(packageFile, "utf8"));
const cli = fileURLToPath(
  new URL(typeof bin === "string" ? bin : bin.supabase, packageFile),
);
const result = spawnSync(
  process.execPath,
  [
    cli,
    "gen",
    "types",
    "--lang",
    "typescript",
    "--project-id",
    projectId,
    "--schema",
    "public",
  ],
  { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
);

if (
  result.error ||
  result.status !== 0 ||
  !result.stdout?.includes("export type Database")
) {
  console.error(
    "Supabase type generation failed. Verify the project reference and CLI access.",
  );
  process.exit(1);
}

writeFileSync(
  new URL("../src/types/database.ts", import.meta.url),
  result.stdout,
  "utf8",
);
console.log("Generated src/types/database.ts.");
