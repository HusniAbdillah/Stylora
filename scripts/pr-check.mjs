// Mechanical pull request gate from docs/WORKFLOW.md section 10.
//
//   node scripts/pr-check.mjs                  report size, lane and time window
//   node scripts/pr-check.mjs --require-lane-a exit 2 unless the diff is Lane A
//
// It reads git only. It never pushes, merges or calls a provider.
// Optional: set STYLORA_T0 to the ISO start time of the build, for example
// 2026-11-07T09:00:00+07:00, to enforce the 05:15 and 06:00 merge limits.

import { execFileSync } from "node:child_process";

const MAX_LINES = 400;
const LAST_FEATURE_MERGE_MINUTES = 5 * 60 + 15;
const FEATURE_FREEZE_MINUTES = 6 * 60;

const LANE_B_PATTERNS = [
  /^src\/app\/globals\.css$/,
  /^src\/app\/layout\.tsx$/,
  /^src\/components\/(shell|ui)\//,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^\.env\.example$/,
  /^supabase\//,
  /^src\/types\/database\.ts$/,
  /^\.github\//,
  /^Makefile$/,
  /^vercel\.json$/,
  /^scripts\//,
  /^src\/prompts\//,
  /^AGENTS\.md$/,
  /^\.agents\//,
  /^docs\/(PRD|TDD|DESIGN|TASK|RULES|FASHION[A-Z-]*|WORKFLOW|AGENT-PLAYBOOK|DATABASE)\.md$/,
  /(^|\/)(storage|security|workspace|sharing)(\/|\.|-)/,
  /^src\/features\/(sharing|storage|workspace)\//,
];

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

const requireLaneA = process.argv.includes("--require-lane-a");
const problems = [];

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch === "main") {
  console.error("On main. Create a branch oN/<slug> first (make wt).");
  process.exit(1);
}

git("fetch", "--quiet", "origin", "main");
const range = "origin/main...HEAD";
const numstat = git("diff", "--numstat", range)
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [added, removed, ...rest] = line.split("\t");
    return {
      file: rest.join("\t"),
      lines: (Number(added) || 0) + (Number(removed) || 0),
    };
  });

const total = numstat.reduce((sum, entry) => sum + entry.lines, 0);
const laneBFiles = numstat
  .filter((entry) => LANE_B_PATTERNS.some((p) => p.test(entry.file)))
  .map((entry) => entry.file);

console.log(
  `Branch ${branch}: ${numstat.length} files, ${total} changed lines`,
);

if (numstat.length === 0) problems.push("No diff against origin/main.");
if (total > MAX_LINES) {
  problems.push(
    `Over ${MAX_LINES} lines. Split the pull request or use Lane B.`,
  );
}
if (laneBFiles.length > 0) {
  problems.push(`Lane B paths touched: ${laneBFiles.join(", ")}`);
}

const behind = Number(git("rev-list", "--count", "HEAD..origin/main"));
if (behind > 0) {
  console.log(
    `Note: ${behind} commits behind origin/main. CI tests the merge; rebase only on conflict.`,
  );
}

const dirty = git("status", "--porcelain");
if (dirty)
  console.log("Note: uncommitted or untracked files are not in the diff.");

const t0 = process.env.STYLORA_T0 ? Date.parse(process.env.STYLORA_T0) : NaN;
if (process.env.STYLORA_T0 && Number.isNaN(t0)) {
  problems.push("STYLORA_T0 is not a valid ISO time.");
} else if (!Number.isNaN(t0)) {
  const minutes = Math.floor((Date.now() - t0) / 60000);
  console.log(
    `Build clock: T0 plus ${Math.floor(minutes / 60)}h ${minutes % 60}m`,
  );
  if (minutes >= FEATURE_FREEZE_MINUTES) {
    problems.push("After the 06:00 freeze. A human must merge.");
  } else if (minutes >= LAST_FEATURE_MERGE_MINUTES) {
    problems.push(
      "After 05:15. Only blocker fixes merge; state the reason in the pull request.",
    );
  }
}

const lane = problems.length === 0 ? "A" : "B or blocked";
console.log(`Lane: ${lane}`);
for (const problem of problems) console.log(`- ${problem}`);

if (requireLaneA && problems.length > 0) {
  console.error(
    "Stop: not Lane A. Leave the pull request open for human approval.",
  );
  process.exit(2);
}
