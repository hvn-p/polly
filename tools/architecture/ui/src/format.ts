// The format of what the analyzer sends the view, as a JSON Schema the
// analyzer generates from its types (`report-schema`): the view is built
// against one, the analyzer serves its own, and a gap between them means the
// view reads fields the analyzer does not send, or the reverse.

type Node = Record<string, unknown>

export interface FormatGap {
  // Fields the view reads that the analyzer does not send.
  missing: string[]
  // Fields the analyzer sends that the view does not know.
  unknown: string[]
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical)
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical((value as Node)[key])]),
    )
  }
  return value
}

// Every field path a format describes, through its references, arrays and
// optional values: `report.edges[].uses`.
function fieldsOf(format: Node): Set<string> {
  const definitions = (format['$defs'] ?? {}) as Record<string, Node>
  const found = new Set<string>()
  const visit = (node: unknown, path: string, seen: ReadonlySet<string>): void => {
    if (typeof node !== 'object' || node === null) {
      return
    }
    const schema = node as Node
    const reference = typeof schema['$ref'] === 'string' ? schema['$ref'].replace('#/$defs/', '') : undefined
    if (reference !== undefined) {
      if (!seen.has(reference)) {
        visit(definitions[reference], path, new Set([...seen, reference]))
      }
      return
    }
    for (const member of [
      ...((schema['anyOf'] ?? []) as unknown[]),
      ...((schema['oneOf'] ?? []) as unknown[]),
    ]) {
      visit(member, path, seen)
    }
    visit(schema['items'], `${path}[]`, seen)
    for (const [name, child] of Object.entries((schema['properties'] ?? {}) as Node)) {
      const field = path === '' ? name : `${path}.${name}`
      found.add(field)
      visit(child, field, seen)
    }
  }
  visit(format, '', new Set())
  return found
}

// Undefined when both formats are the same; otherwise the fields each lacks,
// both lists empty when only a field's type or bounds differ.
export function formatGap(expected: Node, served: Node): FormatGap | undefined {
  if (JSON.stringify(canonical(expected)) === JSON.stringify(canonical(served))) {
    return undefined
  }
  const [viewFields, analyzerFields] = [fieldsOf(expected), fieldsOf(served)]
  // A field once, not again for each field under it.
  const topmost = (fields: string[]) =>
    fields.filter(
      (field) => !fields.some((other) => field.startsWith(`${other}.`) || field.startsWith(`${other}[]`)),
    )
  return {
    missing: topmost([...viewFields].filter((field) => !analyzerFields.has(field))),
    unknown: topmost([...analyzerFields].filter((field) => !viewFields.has(field))),
  }
}

export interface DiffLine {
  // ' ' kept, '-' only in the view's format, '+' only in the analyzer's, '…'
  // lines folded away.
  kind: ' ' | '-' | '+' | '…'
  text: string
}

const CONTEXT = 3

// The two formats, keys sorted and indented, compared line by line through
// their longest common subsequence; lines further than CONTEXT from a change
// fold into one '…'. Empty when the formats are the same.
export function formatDiff(expected: Node, served: Node): DiffLine[] {
  const [before, after] = [expected, served].map((format) =>
    JSON.stringify(canonical(format), null, 2).split('\n'),
  )
  const [a, b] = [before ?? [], after ?? []]
  // common[i][j]: the longest common subsequence of a from i and b from j.
  const common = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = common[i] as number[]
      row[j] =
        a[i] === b[j] ? (common[i + 1]?.[j + 1] ?? 0) + 1 : Math.max(common[i + 1]?.[j] ?? 0, row[j + 1] ?? 0)
    }
  }
  const lines: DiffLine[] = []
  let [i, j] = [0, 0]
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push({ kind: ' ', text: a[i] ?? '' })
      i++
      j++
    } else if (j < b.length && (i === a.length || (common[i]?.[j + 1] ?? 0) >= (common[i + 1]?.[j] ?? 0))) {
      lines.push({ kind: '+', text: b[j] ?? '' })
      j++
    } else {
      lines.push({ kind: '-', text: a[i] ?? '' })
      i++
    }
  }
  const near = (k: number) =>
    lines.slice(Math.max(0, k - CONTEXT), k + CONTEXT + 1).some((line) => line.kind !== ' ')
  if (!lines.some((line) => line.kind !== ' ')) {
    return []
  }
  return lines.flatMap((line, k): DiffLine[] => {
    if (line.kind !== ' ' || near(k)) {
      return [line]
    }
    return near(k - 1) || k === 0 ? [{ kind: '…', text: '' }] : []
  })
}
