import { describe, expect, it } from 'vitest'
import { formatDiff, formatGap } from './format.ts'

// A format as the analyzer writes it: properties, references into $defs,
// arrays and optional values.
function format(edge: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    type: 'object',
    properties: { report: { $ref: '#/$defs/Report' }, change: { $ref: '#/$defs/Change' } },
    $defs: {
      Report: {
        type: 'object',
        properties: {
          edges: { type: 'array', items: { $ref: '#/$defs/Edge' } },
          base: { anyOf: [{ $ref: '#/$defs/Base' }, { type: 'null' }] },
          ...extra,
        },
      },
      Edge: { type: 'object', properties: edge },
      Base: { type: 'object', properties: { ref: { type: 'string' } } },
      Change: { type: 'object', properties: { at: { type: 'integer' } } },
    },
  }
}

const edge = { from: { type: 'string' }, uses: { type: 'array', items: { type: 'object' } } }

describe('the gap between two report formats', () => {
  it('is none for the same format, whatever the order of its keys', () => {
    const reordered = JSON.parse(
      JSON.stringify(format(edge)).replace('"type":"object","properties"', '"properties"'),
    )
    expect(formatGap(format(edge), format(edge))).toBeUndefined()
    expect(formatGap(format(edge), { ...reordered, type: 'object' })).toBeUndefined()
  })

  it('names each field the view reads and the analyzer does not send, and the reverse, through arrays and options', () => {
    const { uses: _, ...older } = edge
    expect(formatGap(format(edge), format(older, { name: { type: 'string' } }))).toEqual({
      missing: ['report.edges[].uses'],
      unknown: ['report.name'],
    })
  })

  it('names a missing or unknown field once, without the fields under it', () => {
    const uses = {
      type: 'array',
      items: { type: 'object', properties: { line: { type: 'integer' }, column: { type: 'integer' } } },
    }
    const { uses: _, ...older } = edge
    expect(formatGap(format({ ...edge, uses }), format(older, { base2: uses }))).toEqual({
      missing: ['report.edges[].uses'],
      unknown: ['report.base2'],
    })
  })

  it('still differs when only a field changed its type', () => {
    expect(formatGap(format(edge), format({ ...edge, from: { type: 'integer' } }))).toEqual({
      missing: [],
      unknown: [],
    })
  })
})

describe('the difference between two report formats, line by line', () => {
  it('shows what the view expects as removed and what the analyzer sends as added, around them only', () => {
    const { uses: _, ...older } = edge
    const lines = formatDiff(format(edge), format(older))
    const changed = lines.filter((line) => line.kind !== ' ' && line.kind !== '…')
    expect(changed.map((line) => `${line.kind}${line.text.trim()}`)).toEqual([
      '-},',
      '-"uses": {',
      '-"items": {',
      '-"type": "object"',
      '-},',
      '-"type": "array"',
    ])
    // Three lines of context around each change, the rest folded.
    const first = lines.findIndex((line) => line.kind === '-')
    expect(lines.slice(0, first).filter((line) => line.kind === ' ')).toHaveLength(3)
    expect(lines[0]?.kind).toBe('…')
  })

  it('is empty for the same format, whatever the order of its keys', () => {
    expect(formatDiff(format(edge), JSON.parse(JSON.stringify(format(edge))))).toEqual([])
  })
})
