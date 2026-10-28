// Dependency gates: `outdated` and `audit`, each checked against docs/dependency-exceptions.md.
//
//   node tools/deps-check.ts outdated   newest stable release at least COOLDOWN_DAYS old, everywhere
//   node tools/deps-check.ts audit      npm audit at level low, minus listed advisories
//
// A listed exception that no longer matches anything fails too, so the list can't go stale.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const COOLDOWN_DAYS = 2;
const EXCEPTIONS_FILE = "docs/dependency-exceptions.md";
const STABLE = /^\d+\.\d+\.\d+$/;
const cutoff = Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

interface Problem {
  readonly what: string;
  readonly why: string;
}

/** Rows of the markdown table under `## <heading>`, as cells (backticks stripped). */
function tableRows(markdown: string, heading: string): string[][] {
  const rows: string[][] = [];
  let inSection = false;
  for (const line of markdown.split("\n")) {
    if (line.startsWith("## ")) {
      inSection = line.slice(3).trim() === heading;
      continue;
    }
    if (!inSection || !line.startsWith("|") || /^\|\s*-/.test(line)) continue;
    rows.push(
      line
        .slice(1, line.endsWith("|") ? -1 : undefined)
        .split(/(?<!\\)\|/)
        .map((cell) => cell.trim().replaceAll("`", "")),
    );
  }
  return rows.slice(1); // drop the header row
}

function run(cmd: string, args: readonly string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    // npm outdated and npm audit exit 1 when they find something; their JSON is still on stdout.
    const out = (error as { stdout?: unknown }).stdout;
    if (typeof out === "string" && out.length > 0) return out;
    throw error;
  }
}

function compare(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** The newest stable version published before the cooldown cutoff. */
function newestSettled(times: Readonly<Record<string, string>>): string | undefined {
  return Object.entries(times)
    .filter(([v, at]) => STABLE.test(v) && Date.parse(at) <= cutoff)
    .map(([v]) => v)
    .sort(compare)
    .at(-1);
}

function npmTimes(pkg: string): Record<string, string> {
  return JSON.parse(run("npm", ["view", pkg, "time", "--json"])) as Record<string, string>;
}

async function crateTimes(name: string): Promise<Record<string, string>> {
  const res = await fetch(`https://crates.io/api/v1/crates/${name}/versions?per_page=100`, {
    headers: { "User-Agent": "crewkit-app deps-check (github.com/Exploded-views/crewkit-app)" },
  });
  if (!res.ok) throw new Error(`crates.io ${name}: HTTP ${String(res.status)}`);
  const body = (await res.json()) as {
    versions: { num: string; created_at: string; yanked: boolean }[];
  };
  return Object.fromEntries(
    body.versions.filter((v) => !v.yanked).map((v) => [v.num, v.created_at]),
  );
}

interface NpmOutdated {
  current?: string;
  wanted: string;
  latest: string;
  dependent?: string;
  location?: string;
}

/** A direct dependency must be on the newest settled stable release. */
function directProblem(pkg: string, current: string, latest: string): Problem | undefined {
  if (current === latest) return undefined;
  const settled = newestSettled(npmTimes(pkg));
  if (settled === undefined || compare(current, settled) >= 0) return undefined;
  return { what: `npm ${pkg}`, why: `${current} is behind ${settled}` };
}

/** A transitive dependency must be on the newest settled release its parent's range allows. */
function transitiveProblem(pkg: string, current: string, entry: NpmOutdated): Problem | undefined {
  if (current === entry.wanted) return undefined;
  const at = npmTimes(pkg)[entry.wanted];
  if (at === undefined || Date.parse(at) > cutoff) return undefined;
  return {
    what: `npm ${pkg}`,
    why: `${current} (under ${entry.dependent ?? "?"}) is behind ${entry.wanted}, which its range allows: the lockfile is stale`,
  };
}

function npmOutdated(direct: ReadonlySet<string>): Problem[] {
  const all = JSON.parse(run("npm", ["outdated", "--all", "--json"]) || "{}") as Record<
    string,
    NpmOutdated | NpmOutdated[]
  >;
  const problems: (Problem | undefined)[] = [];
  for (const [pkg, value] of Object.entries(all)) {
    for (const entry of Array.isArray(value) ? value : [value]) {
      const { current } = entry;
      if (current === undefined) continue; // an optional peer that isn't installed
      const isDirect = direct.has(pkg) && entry.location === `node_modules/${pkg}`;
      problems.push(
        isDirect
          ? directProblem(pkg, current, entry.latest)
          : transitiveProblem(pkg, current, entry),
      );
    }
  }
  return problems.filter((p) => p !== undefined);
}

async function cargoOutdated(): Promise<Problem[]> {
  const out = run("cargo", [
    "outdated",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--format",
    "json",
    "--exit-code",
    "0",
  ]);
  const deps = (
    JSON.parse(out) as { dependencies: { name: string; project: string; latest: string }[] }
  ).dependencies;
  const problems: Problem[] = [];
  for (const dep of deps) {
    if (!STABLE.test(dep.latest) || dep.project === dep.latest) continue;
    const crate = dep.name.split("->").at(-1) ?? dep.name;
    const settled = newestSettled(await crateTimes(crate));
    if (settled !== undefined && compare(dep.project, settled) < 0) {
      problems.push({ what: `cargo ${dep.name}`, why: `${dep.project} is behind ${settled}` });
    }
  }
  return problems;
}

function npmAdvisories(): Problem[] {
  const report = JSON.parse(run("npm", ["audit", "--audit-level=low", "--json"])) as {
    vulnerabilities?: Record<string, { via: (string | { url: string; title: string })[] }>;
  };
  const problems: Problem[] = [];
  for (const [pkg, vuln] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of vuln.via) {
      if (typeof via === "string") continue; // reported again under the package it comes from
      const id = via.url.split("/").at(-1) ?? via.url;
      problems.push({ what: `npm ${id}`, why: `${pkg}: ${via.title}` });
    }
  }
  return problems;
}

/** Fails on each problem not listed, and on each listed exception that matched nothing. */
function judge(problems: readonly Problem[], listed: readonly string[]): string[] {
  const failures: string[] = [];
  const seen = new Set(problems.map((p) => p.what));
  for (const p of problems) {
    if (!listed.includes(p.what)) failures.push(`${p.what}: ${p.why} (not in ${EXCEPTIONS_FILE})`);
  }
  for (const what of listed) {
    if (!seen.has(what))
      failures.push(`${what}: listed in ${EXCEPTIONS_FILE} but no longer needed; remove it`);
  }
  return failures;
}

async function main(mode: string | undefined): Promise<number> {
  const doc = readFileSync(EXCEPTIONS_FILE, "utf8");
  let problems: Problem[];
  let listed: string[];
  if (mode === "outdated") {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as Record<
      string,
      Record<string, string> | undefined
    >;
    const direct = new Set([
      ...Object.keys(pkg["dependencies"] ?? {}),
      ...Object.keys(pkg["devDependencies"] ?? {}),
    ]);
    problems = [...npmOutdated(direct), ...(await cargoOutdated())];
    listed = tableRows(doc, "Held versions").map(([eco, name]) => `${eco ?? ""} ${name ?? ""}`);
  } else if (mode === "audit") {
    problems = npmAdvisories();
    listed = tableRows(doc, "Advisories").map(([eco, id]) => `${eco ?? ""} ${id ?? ""}`);
  } else {
    process.stderr.write("usage: node tools/deps-check.ts outdated|audit\n");
    return 64;
  }
  const failures = judge(problems, listed);
  for (const f of failures) process.stderr.write(`deps-check ${mode}: ${f}\n`);
  if (failures.length === 0)
    process.stdout.write(`deps-check ${mode}: ok (${String(listed.length)} listed exceptions)\n`);
  return failures.length === 0 ? 0 : 1;
}

process.exitCode = await main(process.argv[2]);
