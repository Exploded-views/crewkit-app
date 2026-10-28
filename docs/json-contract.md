# JSON contract (Issue A)

Release 1 builds against these shapes: crewkit's machine-readable output for `status`, `doctor` and
every dry run. This is a copy of Issue A from the app's design spec; crewkit's own `docs/json.md` and
its checked-in JSON Schemas are the authority once they land, and the app's fixtures follow them.

The app accepts only the schema majors `crewkit.status/v1`, `crewkit.doctor/v1` and
`crewkit.plan/v1`, and refuses any other with a clear message.

## `crewkit status [node] --json`

Prints one JSON document on stdout instead of the table:

```json
{
  "schema": "crewkit.status/v1",
  "generated_at": "<RFC 3339>",
  "registry": { "holder": "<codename>", "synced_at": "<RFC 3339>", "push_pending": false },
  "crews": [{ "name": "<crew>", "state": "ready|partial|stopped", "nodes": ["<node_id>"] }],
  "nodes": [
    {
      "node_id": "…",
      "name": "<codename>",
      "crew": "<crew>",
      "role": "hub|spoke|…",
      "labels": { "k": "v" },
      "state": "joining|ready|paused|draining|gone",
      "quiet": false,
      "placement": { "kind": "local|ssh|provider", "provider": null },
      "versions": { "crewkit": "…", "herdr": "…", "herdr_protocol": "…" },
      "limits": [
        { "name": "max_sessions", "value": 4, "reading": 2, "enforced": true, "reason": null }
      ],
      "spend": { "today_usd": 0.0, "cap_usd": null },
      "report_at": "<RFC 3339>",
      "agents": [
        {
          "name": "…",
          "kind": "claude|codex|opencode|…",
          "role": "lead|bridge|…",
          "access": "reader|writer",
          "status": "idle|working|blocked|done|unknown",
          "since": "<RFC 3339>"
        }
      ],
      "outbox": [{ "id": "…", "owner": true, "at": "<RFC 3339>" }],
      "boundary": "owner|client",
      "reach": { "herdr_machine": "<label>|null" }
    }
  ],
  "services": [
    {
      "id": "registry|bus|bark|ntfy|memsync",
      "health": "ok|warn|fail|unknown",
      "checked_at": "<RFC 3339>"
    }
  ]
}
```

- `boundary` says whether the node serves a client. The app never opens a live herdr connection to a
  `client` node.
- `reach.herdr_machine` is the hub's own herdr machine label for the node, from `nodes.<name>.*`, so
  the app can open `herdr remote-api-bridge` without reading crewkit's settings. It appears only in
  the hub's local output and is never written to the registry.
- Apart from `reach`, fields carry only what the registry already holds (codenames, ids, enums,
  counts, timestamps). No hostnames, ssh targets, paths, pane titles, cwd or screen text: the same
  rule as the registry files.

## `crewkit doctor [node] --json`

```json
{
  "schema": "crewkit.doctor/v1",
  "generated_at": "…",
  "checks": [
    {
      "id": "memsync.launchd.runatload",
      "node": "<codename>",
      "piece": "memsync",
      "result": "pass|warn|fail|unenforced",
      "summary": "<fixed catalog text>",
      "fix": {
        "id": "memsync.reinstall-agent",
        "kind": "cli|owner|agent",
        "command": ["crewkit", "…"],
        "docs": "docs/…#…"
      }
    }
  ]
}
```

- `id`, `summary` and `fix` come from a fixed catalog in crewkit (`docs/doctor-checks.md`). `summary`
  is never free text from a node.
- Unknown problems use one `unknown` id with no text.

## `--json` on every dry run

On the dry run of every state-changing verb (`init`, `join`, `install.sh`, later `pause`, `drain`,
`leave`, `up`, `uninstall`):

```json
{
  "schema": "crewkit.plan/v1",
  "steps": [{ "id": "…", "does": "<fixed text>", "changes": ["file|service|remote"] }],
  "owner_steps": [{ "id": "…", "command": "…", "why": "…" }]
}
```

## Rules

1. Exit codes stay as in crewkit's `docs/exit-codes.md` (0, 1, 3, 43, 64, 65, 75, 78). `--json`
   changes the output format only.
2. Each schema is versioned (`/v1`), documented in crewkit's `docs/json.md`, and has a contract test
   that pins the field set. A mutant that adds a free-text field from a node report must be killed
   (the untrusted-input rule).
3. `status --json` and `doctor --json` validate against checked-in JSON Schemas in crewkit's CI. An
   injection suite feeds hostile pane titles and outbox text and asserts that none of it appears in
   either output.
