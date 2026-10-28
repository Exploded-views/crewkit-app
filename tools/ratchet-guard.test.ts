// Tests for tools/ratchet-guard.ts, run by `npm run test:tools` (node --test).
// Each test drives the real CLI in a throwaway git repo, the way CI runs it.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { afterEach, beforeEach, test } from "node:test";

const GUARD = join(import.meta.dirname, "ratchet-guard.ts");
const COVERAGE = { rust: { lines: 90, regions: 90 }, not_measured: { "src/main.rs": "glue" } };
const MUTATION = { rust: { min_score: 85 } };

let repo = "";

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function writeRatchets(coverage: unknown, suppressions = "1\n"): void {
  writeFileSync(join(repo, "ratchets/coverage.json"), `${JSON.stringify(coverage)}\n`);
  writeFileSync(join(repo, "ratchets/mutation.json"), `${JSON.stringify(MUTATION)}\n`);
  writeFileSync(join(repo, "ratchets/suppressions.txt"), suppressions);
}

function commit(message: string): string {
  git("add", "-A");
  git("commit", "-q", "-m", message);
  return git("rev-parse", "HEAD");
}

/** Runs the guard in the repo; returns its exit code and stderr. */
function guard(base: string, mode: string): { code: number | null; stderr: string } {
  const run = spawnSync(process.execPath, [GUARD, base, mode], { cwd: repo, encoding: "utf8" });
  return { code: run.status, stderr: run.stderr };
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "ratchet-guard-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  git("config", "commit.gpgsign", "false");
  mkdirSync(join(repo, "ratchets"));
  writeRatchets(COVERAGE);
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

void test("a squash-merged chore/ratchet-* PR that raises a floor passes on the push to main", () => {
  const before = commit("chore: base");
  writeRatchets({ ...COVERAGE, rust: { lines: 93, regions: 91 } });
  commit("chore(ratchet): raise rust floors (#7)"); // the squash commit on main
  const run = guard(before, "--push");
  assert.equal(run.stderr, "");
  assert.equal(run.code, 0);
});

void test("a push to main that lowers a floor fails", () => {
  const before = commit("chore: base");
  writeRatchets({ ...COVERAGE, rust: { lines: 89, regions: 90 } });
  commit("fix: something");
  const run = guard(before, "--push");
  assert.equal(run.code, 1);
  assert.match(run.stderr, /rust\.lines went from 90 to 89/);
});

void test("a push to main that adds an exclusion fails", () => {
  const before = commit("chore: base");
  writeRatchets({ ...COVERAGE, not_measured: { ...COVERAGE.not_measured, "src/x.rs": "no" } });
  commit("fix: something");
  const run = guard(before, "--push");
  assert.equal(run.code, 1);
  assert.match(run.stderr, /gained an exclusion: src\/x\.rs/);
});

void test("a push to main that raises the suppression count fails", () => {
  const before = commit("chore: base");
  writeRatchets(COVERAGE, "2\n");
  commit("fix: something");
  const run = guard(before, "--push");
  assert.equal(run.code, 1);
  assert.match(run.stderr, /went up from 1 to 2/);
});

void test("a pull request from another branch may not change the ratchets", () => {
  const before = commit("chore: base");
  writeRatchets({ ...COVERAGE, rust: { lines: 93, regions: 91 } });
  commit("feat: something");
  const run = guard(before, "feat/something");
  assert.equal(run.code, 1);
  assert.match(run.stderr, /changed outside a chore\/ratchet-\* branch \(feat\/something\)/);
});

void test("a pull request from a chore/ratchet-* branch may raise a floor", () => {
  const before = commit("chore: base");
  writeRatchets({ ...COVERAGE, rust: { lines: 93, regions: 91 } });
  commit("chore(ratchet): raise rust floors");
  assert.equal(guard(before, "chore/ratchet-rust").code, 0);
});

void test("a chore/ratchet-* pull request still may not lower a floor", () => {
  const before = commit("chore: base");
  writeRatchets({ ...COVERAGE, rust: { lines: 80, regions: 90 } });
  commit("chore(ratchet): lower");
  const run = guard(before, "chore/ratchet-rust");
  assert.equal(run.code, 1);
  assert.match(run.stderr, /rust\.lines went from 90 to 80/);
});

void test("unchanged ratchets pass in either mode", () => {
  const before = commit("chore: base");
  writeFileSync(join(repo, "README.md"), "x\n");
  commit("docs: readme");
  assert.equal(guard(before, "--push").code, 0);
  assert.equal(guard(before, "feat/other").code, 0);
});

void test("a missing argument is a usage error", () => {
  const run = spawnSync(process.execPath, [GUARD, "HEAD"], { cwd: repo, encoding: "utf8" });
  assert.equal(run.status, 64);
  assert.match(run.stderr, /usage:/);
});
