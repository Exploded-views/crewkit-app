// Ratchet guard: ratchets/ changes only in chore/ratchet-* PRs, and only one way.
//   coverage.json, mutation.json: numbers only rise, listed files stay listed, not_* exclusions
//   only shrink. suppressions.txt: only goes down.
//
//   node tools/ratchet-guard.ts <base-ref> <head-branch>   a pull request: branch name and direction
//   node tools/ratchet-guard.ts <base-ref> --push          a push to main: direction only, because a
//                                                           squash-merged chore/ratchet-* PR lands
//                                                           on main under main's name
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const FILES = ["ratchets/coverage.json", "ratchets/mutation.json", "ratchets/suppressions.txt"];

function atBase(base: string, path: string): string | undefined {
  try {
    return execFileSync("git", ["show", `${base}:${path}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return undefined; // not on the base yet
  }
}

type Json = Record<string, unknown>;

function asObject(value: unknown): Json {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Json)
    : {};
}

/** An exclusion map (not_measured, not_mutated) may only lose keys. */
function exclusionsLoosened(prev: Json, next: Json, path: string): string[] {
  return Object.keys(next)
    .filter((key) => !(key in prev))
    .map((key) => `${path} gained an exclusion: ${key}`);
}

/** Ways `now` loosens `before`, by JSON path. */
function loosened(before: unknown, now: unknown, path: string): string[] {
  if (typeof before === "number") {
    const rose = typeof now === "number" && now >= before;
    return rose ? [] : [`${path} went from ${String(before)} to ${String(now)}`];
  }
  if (Array.isArray(before)) {
    const kept: unknown[] = Array.isArray(now) ? now : [];
    return before.filter((x) => !kept.includes(x)).map((x) => `${path} dropped ${String(x)}`);
  }
  const prev = asObject(before);
  const next = asObject(now);
  if (/(^|\.)not_[a-z_]+$/.test(path)) return exclusionsLoosened(prev, next, path);
  return Object.entries(prev).flatMap(([key, value]) =>
    loosened(value, next[key], path === "" ? key : `${path}.${key}`),
  );
}

/** The guard's mode: a pull request from a named branch, or a push (`--push`), direction only. */
const PUSH = "--push";

function checkFile(path: string, base: string, branch: string): string[] {
  const before = atBase(base, path);
  const now = readFileSync(path, "utf8");
  if (before === undefined || before === now) return [];
  const failures: string[] = [];
  if (branch !== PUSH && !branch.startsWith("chore/ratchet-"))
    failures.push(`${path} changed outside a chore/ratchet-* branch (${branch})`);
  if (!path.endsWith(".txt")) {
    const problems = loosened(JSON.parse(before), JSON.parse(now), "");
    return [...failures, ...problems.map((p) => `${path}: ${p}`)];
  }
  if (Number(now.trim()) > Number(before.trim()))
    failures.push(`${path} went up from ${before.trim()} to ${now.trim()}; it may only go down`);
  return failures;
}

function main(base: string | undefined, branch: string | undefined): number {
  if (base === undefined || branch === undefined) {
    process.stderr.write("usage: node tools/ratchet-guard.ts <base-ref> <head-branch|--push>\n");
    return 64;
  }
  const failures = FILES.flatMap((path) => checkFile(path, base, branch));
  for (const f of failures) process.stderr.write(`ratchet-guard: ${f}\n`);
  if (failures.length === 0) process.stdout.write("ratchet-guard: ok\n");
  return failures.length === 0 ? 0 : 1;
}

process.exitCode = main(process.argv[2], process.argv[3]);
