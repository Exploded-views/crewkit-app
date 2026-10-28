// Coverage gate: global, per-file, security-critical and diff floors from ratchets/coverage.json,
// plus a denominator check that every app source file is in a report.
//
//   node tools/coverage-gate.ts rust [base]        coverage/rust-summary.json (+ coverage/rust.lcov)
//   node tools/coverage-gate.ts typescript [base]  coverage/ts/coverage-summary.json (+ lcov.info)
//
// With a base ref, the lines this language's files added since that ref must meet diff_lines.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { repoPath, sourceFiles } from "./sources.ts";

interface Ratchet {
  rust: { lines: number; regions: number };
  typescript: { lines: number; branches: number };
  per_file_lines: number;
  diff_lines: number;
  security_critical: { lines: number; regions_or_branches: number; files: string[] };
  not_measured: Record<string, string>;
}

/** Covered and total for one measure (lines, regions or branches). */
interface Measure {
  covered: number;
  total: number;
}

interface FileCoverage {
  lines: Measure;
  /** Regions for Rust, branches for TypeScript. */
  second: Measure;
}

const ROOT = process.cwd();
const ratchet = JSON.parse(readFileSync("ratchets/coverage.json", "utf8")) as Ratchet;

function pct(m: Measure): number {
  return m.total === 0 ? 100 : (100 * m.covered) / m.total;
}

function show(m: Measure): string {
  return `${pct(m).toFixed(2)}% (${String(m.covered)}/${String(m.total)})`;
}

function readJson(path: string): unknown {
  if (!existsSync(path)) throw new Error(`coverage-gate: ${path} is missing; run coverage first`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function rustReport(): Map<string, FileCoverage> {
  const report = readJson("coverage/rust-summary.json") as {
    data: {
      files: {
        filename: string;
        summary: {
          lines: { count: number; covered: number };
          regions: Measure & { count: number };
        };
      }[];
    }[];
  };
  const files = new Map<string, FileCoverage>();
  for (const f of report.data[0]?.files ?? []) {
    files.set(repoPath(f.filename, ROOT), {
      lines: { covered: f.summary.lines.covered, total: f.summary.lines.count },
      second: { covered: f.summary.regions.covered, total: f.summary.regions.count },
    });
  }
  return files;
}

function tsReport(): Map<string, FileCoverage> {
  const report = readJson("coverage/ts/coverage-summary.json") as Record<
    string,
    { lines: Measure; branches: Measure }
  >;
  const files = new Map<string, FileCoverage>();
  for (const [path, f] of Object.entries(report)) {
    if (path === "total") continue;
    files.set(repoPath(path, ROOT), { lines: f.lines, second: f.branches });
  }
  return files;
}

function sum(files: Iterable<FileCoverage>, pick: (f: FileCoverage) => Measure): Measure {
  const total: Measure = { covered: 0, total: 0 };
  for (const f of files) {
    total.covered += pick(f).covered;
    total.total += pick(f).total;
  }
  return total;
}

interface Language {
  name: "rust" | "typescript";
  /** "regions" for Rust, "branches" for TypeScript. */
  second: string;
  lines: number;
  secondFloor: number;
  prefix: string;
  lcov: string;
  /** Prefix that makes the lcov's relative paths repo-relative. */
  lcovBase: string;
}

const LANGUAGES: Record<Language["name"], Language> = {
  rust: {
    name: "rust",
    second: "regions",
    lines: ratchet.rust.lines,
    secondFloor: ratchet.rust.regions,
    prefix: "src-tauri/",
    lcov: "coverage/rust.lcov",
    lcovBase: "",
  },
  typescript: {
    name: "typescript",
    second: "branches",
    lines: ratchet.typescript.lines,
    secondFloor: ratchet.typescript.branches,
    prefix: "ui/",
    lcov: "coverage/ts/lcov.info",
    lcovBase: "ui/",
  },
};

/** The denominator check: every measured source file must be in the report. */
function missingFiles(lang: Language, files: ReadonlyMap<string, FileCoverage>): string[] {
  return sourceFiles()
    .filter((f) => f.startsWith(lang.prefix) && !(f in ratchet.not_measured) && !files.has(f))
    .map((f) => `${f} is missing from the ${lang.name} coverage report`);
}

function globalFailures(lang: Language, lines: Measure, second: Measure): string[] {
  const failures: string[] = [];
  if (pct(lines) < lang.lines)
    failures.push(`global lines ${show(lines)} < ${String(lang.lines)}%`);
  if (pct(second) < lang.secondFloor)
    failures.push(`global ${lang.second} ${show(second)} < ${String(lang.secondFloor)}%`);
  return failures;
}

function fileFailures(lang: Language, path: string, f: FileCoverage): string[] {
  const failures: string[] = [];
  if (pct(f.lines) < ratchet.per_file_lines)
    failures.push(`${path}: lines ${show(f.lines)} < ${String(ratchet.per_file_lines)}%`);
  const critical = ratchet.security_critical;
  if (!critical.files.includes(path)) return failures;
  if (pct(f.lines) < critical.lines)
    failures.push(
      `${path} (security-critical): lines ${show(f.lines)} < ${String(critical.lines)}%`,
    );
  if (pct(f.second) < critical.regions_or_branches)
    failures.push(
      `${path} (security-critical): ${lang.second} ${show(f.second)} < ${String(critical.regions_or_branches)}%`,
    );
  return failures;
}

function checkLanguage(lang: Language): string[] {
  const files = lang.name === "rust" ? rustReport() : tsReport();
  const lines = sum(files.values(), (f) => f.lines);
  const second = sum(files.values(), (f) => f.second);
  const failures = missingFiles(lang, files);
  if (lines.total === 0) process.stdout.write(`coverage-gate ${lang.name}: no measured code yet\n`);
  else failures.push(...globalFailures(lang, lines, second));
  for (const [path, f] of files) failures.push(...fileFailures(lang, path, f));
  if (failures.length === 0) {
    process.stdout.write(
      `coverage-gate ${lang.name}: ok, lines ${show(lines)}, ${lang.second} ${show(second)}, ${String(files.size)} files\n`,
    );
  }
  return failures;
}

/** Line hits per repo-relative file, from an lcov file. */
function lcovHits(path: string, base: string): Map<string, Map<number, number>> {
  const hits = new Map<string, Map<number, number>>();
  if (!existsSync(path)) throw new Error(`coverage-gate: ${path} is missing; run coverage first`);
  let current: Map<number, number> | undefined;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.startsWith("SF:")) {
      current = new Map();
      hits.set(repoPath(line.slice(3), ROOT, base), current);
    } else if (line.startsWith("DA:") && current !== undefined) {
      const [n, count] = line.slice(3).split(",").map(Number);
      if (n !== undefined && count !== undefined) current.set(n, count);
    }
  }
  return hits;
}

/** The new-side line numbers of a `@@ -a,b +c,d @@` hunk header. */
function hunkLines(header: string): number[] {
  const match = /\+(\d+)(?:,(\d+))?/.exec(header);
  const start = Number(match?.[1] ?? 0);
  const count = Number(match?.[2] ?? 1);
  return Array.from({ length: count }, (_, i) => start + i);
}

/** Added line numbers per file in `git diff <base>`, for app source files. */
function addedLines(base: string): Map<string, number[]> {
  const sources = new Set(sourceFiles());
  const diff = execFileSync("git", ["diff", "--unified=0", "--no-color", base, "--", ...sources], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const added = new Map<string, number[]>();
  let file: number[] | undefined;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = line.slice(4).replace(/^b\//, "");
      file = sources.has(path) ? [] : undefined;
      if (file !== undefined) added.set(path, file);
    } else if (line.startsWith("@@") && file !== undefined) {
      file.push(...hunkLines(line));
    }
  }
  return added;
}

function checkDiff(lang: Language, base: string): string[] {
  const hits = lcovHits(lang.lcov, lang.lcovBase);
  const measured: Measure = { covered: 0, total: 0 };
  const uncovered: string[] = [];
  for (const [file, lines] of addedLines(base)) {
    if (!file.startsWith(lang.prefix) || file in ratchet.not_measured) continue;
    const fileHits = hits.get(file);
    for (const n of lines) {
      const count = fileHits?.get(n);
      if (count === undefined) continue; // not executable code
      measured.total++;
      if (count > 0) measured.covered++;
      else uncovered.push(`${file}:${String(n)}`);
    }
  }
  if (pct(measured) < ratchet.diff_lines) {
    return [
      `diff coverage ${show(measured)} < ${String(ratchet.diff_lines)}%; uncovered: ${uncovered.join(", ")}`,
    ];
  }
  process.stdout.write(
    `coverage-gate ${lang.name}: diff ok, ${show(measured)} of changed lines vs ${base}\n`,
  );
  return [];
}

function main(mode: string | undefined, base: string | undefined): number {
  if (mode !== "rust" && mode !== "typescript") {
    process.stderr.write("usage: node tools/coverage-gate.ts rust|typescript [base-ref]\n");
    return 64;
  }
  const lang = LANGUAGES[mode];
  const failures = checkLanguage(lang);
  if (base !== undefined) failures.push(...checkDiff(lang, base));
  for (const f of failures) process.stderr.write(`coverage-gate ${mode}: ${f}\n`);
  return failures.length === 0 ? 0 : 1;
}

process.exitCode = main(process.argv[2], process.argv[3]);
