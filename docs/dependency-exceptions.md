# Dependency exceptions

Every dependency is on its newest stable release that is at least 2 days old. This file lists the only
exceptions. `node tools/deps-check.ts outdated` and `node tools/deps-check.ts audit` (CI jobs `outdated`
and `npm-audit`) fail on anything behind or vulnerable that is not listed here, and on any row that no
longer matches anything, so the list can't go stale. Change it only with the reason in the same PR.

Transitive npm packages are allowed to sit below their latest major when the package that depends on
them pins that range; the check fails when a lockfile entry is behind the newest release its parent's
range allows. Cargo is checked at every depth, so each held crate is listed below.

## Held versions

| Ecosystem | Package                | Held at | Pinned by                                                                                                                                  | Link                                                                                                       |
| --------- | ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| npm       | `typescript`           | 6.0.3   | typescript-eslint 8.72 (peer `typescript >=4.8.4 <6.1.0`) and svelte-check 4.7 (peer `^5.0.0 \|\| ^6.0.0`) do not support TypeScript 7 yet | <https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/typescript-eslint/package.json> |
| cargo     | `serde_with->schemars` | 0.9.0   | serde_with 3.24 (under tauri-utils 2.10) offers `schemars_0_9` as its own optional dependency, next to 1.x                                 | <https://github.com/jonasbb/serde_with/blob/master/serde_with/Cargo.toml>                                  |
| cargo     | `serde_with->indexmap` | 1.9.3   | serde_with 3.24 (under tauri-utils 2.10) offers `indexmap_1` as its own optional dependency, next to 2.x                                   | <https://github.com/jonasbb/serde_with/blob/master/serde_with/Cargo.toml>                                  |
| cargo     | `indexmap->hashbrown`  | 0.12.3  | indexmap 1.9 (under schemars 0.8, under tauri-utils 2.10)                                                                                  | <https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-utils/Cargo.toml>                               |
| npm       | `@types/node`          | 24.x    | the Node runtime: CI and the build run on Node 24, the current LTS (`.node-version`); the types follow the runtime                         | <https://nodejs.org/en/about/previous-releases>                                                            |

## Advisories

| Ecosystem | Advisory              | Package         | Pinned by                                                      | Why it is safe here                                                      |
| --------- | --------------------- | --------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| npm       | `GHSA-gcqx-w48m-w2h4` | deepmerge 4.3.1 | @sveltejs/vite-plugin-svelte 7.3 (no patched deepmerge exists) | build time only: it merges our own Vite config, never input from outside |

## Overrides

| Ecosystem | Package | Forced to | Why                                                                                                                                                            |
| --------- | ------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm       | `qs`    | 6.16.1    | typed-rest-client 2.3.1 (under @stryker-mutator/core) pins `qs` 6.15.1, which has GHSA-4mjr-xmp4-gh2g and others; 6.16.1 is the newest settled patched release |
