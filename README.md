# crewkit app

A light macOS menu-bar front end for crewkit and its crews. It
drives the crewkit CLI and never reimplements it: the crew map, doctor with "Fix with an agent",
installing and upgrading crewkit's pieces, and joining a node.

Built with Tauri 2 (a Rust core) and Svelte 5 + TypeScript (the UI). There is no daemon: closing the
window leaves only the menu-bar item, and quitting from its menu ends everything.

Status: release 1 is in progress. This scaffold opens an empty window from the menu-bar icon.

## Setup

- Node: the version in `.node-version` (the current LTS).
- Rust: `rust-toolchain.toml` pins the toolchain; `rustup` installs it on first use.
- On Linux, Tauri's libraries: `libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev`.
- Dev tools the gates use: `cargo-llvm-cov`, `cargo-deny`, `cargo-mutants`, `cargo-outdated`,
  `gitleaks`, `actionlint` and `zizmor`.

```sh
npm ci                                  # also installs the git hooks (lefthook)
npm run tauri dev                       # run the app
npm test                                # UI tests (vitest)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests
npm run tauri build -- --no-bundle      # unsigned build
```

## Git hooks

`npm ci` runs `lefthook install`. Never skip the hooks with `--no-verify`.

- **pre-commit**, on the staged files: rustfmt, clippy, eslint, prettier, svelte-check,
  `tsc --noEmit`, `tools/file-size.sh` and `tools/count-suppressions.sh`.
- **commit-msg**: commitlint (Conventional Commits).
- **pre-push**, in order, stopping at the first failure: the Rust and TypeScript tests with coverage
  and their floors, then crewkit-dev's scrub, then gitleaks:
  `"$CREWKIT_DEV/tools/scrub.sh" --require-denylist --all && gitleaks detect --redact --no-banner`.

The pre-push hook needs two things:

- `CREWKIT_DEV`: the path to your crewkit-dev checkout, which holds `tools/scrub.sh`. The push fails
  if it is unset.
- scrub's private denylist (see `tools/scrub.sh --help` in crewkit-dev); `--require-denylist` fails
  without it.

Optional: set `CREW_HEAVY_LOCK` to a lock file path and the hook's test runs take it with `flock`,
queueing behind other heavy jobs on a shared machine.

## Quality gates

Every gate is blocking, locally and in CI. `ci-ok` is the one required check; it needs every job in
`.github/workflows/ci.yml`. Draft PRs run nothing.

- Rust: rustfmt, clippy with the `[lints]` in `src-tauri/Cargo.toml` and `clippy.toml`, `cargo deny`
  (`deny.toml`), tests under `-D warnings`.
- TypeScript and Svelte: strict `tsconfig.json`, ESLint (`eslint.config.js`), svelte-check,
  prettier and knip.
- Tests: a `console.error` or `console.warn` fails a test; tests run under `TZ=UTC`,
  `America/New_York` and `Asia/Tokyo`.
- Coverage and mutation floors in `ratchets/`, checked by `tools/coverage-gate.ts` and
  `tools/mutation-gate.ts`. Floors only rise and the suppression count only falls;
  `tools/ratchet-guard.ts` lets `ratchets/` change only in `chore/ratchet-*` PRs (on a push to
  `main` it checks only the direction). The gate scripts have their own tests:
  `npm run test:tools`.
- No source file over 500 lines of code (`tools/file-size.sh`). Every lint suppression carries its
  reason on the same line (`tools/count-suppressions.sh`).
- Dependencies: the newest stable release that is at least 2 days old, everywhere. The only
  exceptions are in `docs/dependency-exceptions.md`; `tools/deps-check.ts` checks them both ways.
- Security: gitleaks over the full history, npm audit, the licence allowlist, CodeQL (a job in
  `ci.yml`, so `ci-ok` needs it), and every GitHub Action pinned by commit SHA (actionlint and
  zizmor).

## Docs

- `docs/json-contract.md`: the crewkit JSON shapes this release builds against.
- `docs/dependency-exceptions.md`: the listed dependency exceptions.
- `docs/tdd/`: the failing test output each task saved before its code.

## Licence

MIT. See `LICENSE`.
