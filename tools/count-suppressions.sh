#!/usr/bin/env bash
# Counts lint suppressions and checks them against ratchets/suppressions.txt, which may only go down.
#   Rust:       #[allow(...)], #![allow(...)], #[expect(...)], and "allow" levels in Cargo.toml [lints]
#   TypeScript: eslint-disable*, @ts-expect-error, @ts-ignore (in .ts, .svelte and .js files)
# Every suppression must carry its reason on the same line:
#   #[allow(x, reason = "...")] or a trailing // comment; `eslint-disable... -- reason`;
#   `@ts-expect-error reason`; `lint = "allow" # reason` in Cargo.toml.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
RATCHET=ratchets/suppressions.txt

# Tracked and new (not ignored) files, so a suppression counts before its first commit.
files() { git ls-files --cached --others --exclude-standard -- "$@"; }
search() {
  local pattern=$1 f
  shift
  while IFS= read -r f; do
    if [[ -f "$f" ]]; then grep -nHE "$pattern" "$f" || true; fi
  done < <(files "$@")
  return 0
}

hits=$(
  search '#!?\[(allow|expect)\(' '*.rs'
  search 'eslint-disable|@ts-expect-error|@ts-ignore' '*.ts' '*.svelte' '*.js'
  search '^[a-z_-]+ *= *(\{[^}]*level *= *)?"allow"' '*Cargo.toml'
)

count=0
missing=0
while IFS= read -r hit; do
  [[ -z "$hit" ]] && continue
  count=$((count + 1))
  text=${hit#*:*:}
  if [[ "$text" =~ reason[[:space:]]*= ]] ||
    [[ "$text" =~ \]\)?[[:space:]]*//[[:space:]]*[^[:space:]] ]] ||
    [[ "$text" =~ eslint-disable[a-z-]*[[:space:]].*[[:space:]]--[[:space:]]+[^[:space:]] ]] ||
    [[ "$text" =~ @ts-expect-error[[:space:]]+[^[:space:]] ]] ||
    [[ "$text" =~ \"allow\"[[:space:]]*\}?[[:space:]]*#[[:space:]]*[^[:space:]] ]]; then
    continue
  fi
  echo "count-suppressions: no reason on the same line: $hit" >&2
  missing=$((missing + 1))
done <<<"$hits"

floor=$(tr -d '[:space:]' <"$RATCHET")
if ((missing > 0)); then
  exit 1
fi
if ((count > floor)); then
  echo "count-suppressions: $count suppressions, above the ratchet of $floor ($RATCHET may only go down)" >&2
  echo "$hits" >&2
  exit 1
fi
if ((count < floor)); then
  echo "count-suppressions: $count suppressions, below the ratchet of $floor: lower $RATCHET in a chore/ratchet-* PR"
fi
echo "count-suppressions: ok ($count of at most $floor)"
