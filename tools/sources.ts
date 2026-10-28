// The app's source files, as the coverage and mutation gates see them.
import { execFileSync } from "node:child_process";

const TEST_ONLY = [/\.test\.ts$/, /(^|\/)test-setup\.ts$/, /\.d\.ts$/];

/** Tracked and new (not ignored) app source files, repo-relative, tests excluded. */
export function sourceFiles(): string[] {
  const out = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "src-tauri/src/*.rs",
      "ui/src/*.ts",
      "ui/src/*.svelte",
    ],
    { encoding: "utf8" },
  );
  return out
    .split("\n")
    .filter((f) => f.length > 0 && !TEST_ONLY.some((re) => re.test(f)))
    .sort();
}

/** Repo-relative path for a report path (absolute, or relative to the tool's own root). */
export function repoPath(path: string, root: string, base = ""): string {
  const normal = path.replaceAll("\\", "/");
  const prefix = `${root.replaceAll("\\", "/")}/`;
  return normal.startsWith(prefix) ? normal.slice(prefix.length) : `${base}${normal}`;
}
