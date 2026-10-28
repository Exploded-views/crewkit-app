// Mutation gate: scores from cargo-mutants and Stryker against ratchets/mutation.json, and zero
// survivors in the security-critical files.
//
//   node tools/mutation-gate.ts rust        reads src-tauri/mutants.out/outcomes.json
//   node tools/mutation-gate.ts typescript  reads reports/mutation/ts.json
import { existsSync, readFileSync } from "node:fs";
import { repoPath } from "./sources.ts";

interface Ratchet {
  rust: { min_score: number };
  typescript: { min_score: number };
  zero_survivors: string[];
}

/** One mutant's file and whether the tests caught it (undefined: not counted, e.g. unviable). */
interface Outcome {
  file: string;
  caught: boolean | undefined;
}

const ratchet = JSON.parse(readFileSync("ratchets/mutation.json", "utf8")) as Ratchet;

function rustOutcomes(path: string): Outcome[] {
  const report = JSON.parse(readFileSync(path, "utf8")) as {
    outcomes: { scenario: string | { Mutant: { file: string } }; summary: string }[];
  };
  const counted: Record<string, boolean> = {
    CaughtMutant: true,
    Timeout: true,
    MissedMutant: false,
  };
  return report.outcomes.flatMap(({ scenario, summary }) =>
    typeof scenario === "string"
      ? [] // the baseline run
      : [{ file: `src-tauri/${scenario.Mutant.file}`, caught: counted[summary] }],
  );
}

function tsOutcomes(path: string): Outcome[] {
  const report = JSON.parse(readFileSync(path, "utf8")) as {
    files: Record<string, { mutants: { status: string }[] }>;
  };
  const counted: Record<string, boolean> = {
    Killed: true,
    Timeout: true,
    Survived: false,
    NoCoverage: false,
  };
  return Object.entries(report.files).flatMap(([file, { mutants }]) =>
    mutants.map((m) => ({ file: repoPath(file, process.cwd()), caught: counted[m.status] })),
  );
}

function judge(mode: "rust" | "typescript", outcomes: readonly Outcome[]): string[] {
  const failures = outcomes
    .filter((o) => o.caught === false && ratchet.zero_survivors.includes(o.file))
    .map((o) => `${o.file} is security-critical: a mutant survived`);
  const caught = outcomes.filter((o) => o.caught === true).length;
  const score = outcomes.length === 0 ? 100 : (100 * caught) / outcomes.length;
  const floor = ratchet[mode].min_score;
  if (score < floor) failures.push(`score ${score.toFixed(2)}% < ${String(floor)}%`);
  if (failures.length === 0) {
    process.stdout.write(
      `mutation-gate ${mode}: ok, ${score.toFixed(2)}% (${String(caught)}/${String(outcomes.length)} caught)\n`,
    );
  }
  return failures;
}

function main(mode: string | undefined): number {
  if (mode !== "rust" && mode !== "typescript") {
    process.stderr.write("usage: node tools/mutation-gate.ts rust|typescript\n");
    return 64;
  }
  const path = mode === "rust" ? "src-tauri/mutants.out/outcomes.json" : "reports/mutation/ts.json";
  if (!existsSync(path)) {
    process.stderr.write(
      `mutation-gate ${mode}: ${path} is missing; run the mutation tool first\n`,
    );
    return 1;
  }
  const outcomes = mode === "rust" ? rustOutcomes(path) : tsOutcomes(path);
  const failures = judge(
    mode,
    outcomes.filter((o) => o.caught !== undefined),
  );
  for (const f of failures) process.stderr.write(`mutation-gate ${mode}: ${f}\n`);
  return failures.length === 0 ? 0 : 1;
}

process.exitCode = main(process.argv[2]);
