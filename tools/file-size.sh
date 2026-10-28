#!/usr/bin/env bash
# Fails when a source file (.rs, .ts, .svelte) has more than MAX lines, not counting blank lines
# and comments. Checks the files given as arguments, or every tracked source file.
set -euo pipefail

MAX=500
cd "$(git rev-parse --show-toplevel)"

files=()
if (($# > 0)); then
  for f in "$@"; do
    case "$f" in *.rs | *.ts | *.svelte) [[ -f "$f" ]] && files+=("$f") ;; esac
  done
else
  while IFS= read -r f; do files+=("$f"); done < <(git ls-files --cached --others --exclude-standard -- '*.rs' '*.ts' '*.svelte')
fi

# Counts code lines: drops blank lines, // line comments, /* */ and <!-- --> blocks.
count() {
  awk '
    { line = $0 }
    in_block {
      if (match(line, /\*\/|-->/)) { line = substr(line, RSTART + RLENGTH); in_block = 0 } else next
    }
    {
      while (match(line, /\/\*|<!--/)) {
        rest = substr(line, RSTART + RLENGTH)
        before = substr(line, 1, RSTART - 1)
        if (match(rest, /\*\/|-->/)) { line = before substr(rest, RSTART + RLENGTH) }
        else { line = before; in_block = 1; break }
      }
      sub(/^[ \t]*\/\/.*/, "", line)
      if (line ~ /[^ \t]/) n++
    }
    END { print n + 0 }
  ' "$1"
}

status=0
for f in ${files[@]+"${files[@]}"}; do
  n=$(count "$f")
  if ((n > MAX)); then
    echo "file-size: $f has $n lines of code (max $MAX, blanks and comments excluded)" >&2
    status=1
  fi
done
if ((status == 0)); then echo "file-size: ok (${#files[@]} files, max $MAX)"; fi
exit "$status"
