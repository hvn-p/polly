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
  return {
    missing: [...viewFields].filter((field) => !analyzerFields.has(field)),
    unknown: [...analyzerFields].filter((field) => !viewFields.has(field)),
  }
}
