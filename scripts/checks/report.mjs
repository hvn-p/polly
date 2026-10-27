// How a guard reports: one line per violation, then its fix when there is
// one. Returns the exit status: 1 when anything is reported, 0 otherwise.

/**
 * @param {string[]} violations
 * @param {(line: string) => void} write
 * @param {string} [fix] a closing line naming the fix
 * @returns {number}
 */
export function report(violations, write, fix) {
  for (const violation of violations) {
    write(violation)
  }
  if (violations.length > 0 && fix !== undefined) {
    write(fix)
  }
  return violations.length > 0 ? 1 : 0
}
