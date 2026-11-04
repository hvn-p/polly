import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// A `portless` executable that keeps its routes in a file and answers list,
// alias and alias --remove as portless does, for the adapter's tests where
// portless is absent. Returns the directory to put first on PATH.
export function fakePortless(): string {
  const directory = mkdtempSync(join(tmpdir(), 'fake-portless-'))
  const routes = join(directory, 'routes')
  writeFileSync(routes, '')
  writeFileSync(
    join(directory, 'portless'),
    `#!/bin/sh
routes='${routes}'
case "$1" in
  list)
    echo; echo 'Active routes:'; echo
    while read -r name port; do echo "  https://$name.localhost  ->  localhost:$port  (alias)"; done < "$routes" ;;
  alias)
    if [ "$2" = --remove ]; then
      grep -q "^$3 " "$routes" || { echo "Error: No alias found for \\"$3.localhost\\"." >&2; exit 1; }
      grep -v "^$3 " "$routes" > "$routes.new"; mv "$routes.new" "$routes"
    else
      grep -v "^$2 " "$routes" > "$routes.new"; mv "$routes.new" "$routes"; echo "$2 $3" >> "$routes"
    fi ;;
  *) exit 2 ;;
esac
`,
  )
  chmodSync(join(directory, 'portless'), 0o755)
  return directory
}
