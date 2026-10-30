import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App.tsx'
import { type Feed, type FeedState, snapshotFeed } from './feed.ts'
import { fixture } from './test/fixture.ts'
import type { Change, Identity } from './types.ts'

function feedOf(
  state: Partial<FeedState>,
  sources: Record<string, string> = {},
): Feed & { set: (s: Partial<FeedState>) => void } {
  let current: FeedState = { report: fixture(), history: [], status: 'live', updatedAt: Date.now(), ...state }
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    source: async (file) => sources[file],
    close: () => {},
    set: (next) => {
      current = { ...current, ...next }
      for (const listener of listeners) {
        listener()
      }
    },
  }
}

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

const view = () => document.querySelector('main') as HTMLElement
const side = () => screen.getByRole('complementary', { name: 'Detail' })
const cell = (row: string, column: string) => {
  const rows = [...document.querySelectorAll('table.m th.th-mod')]
  const columns = [...document.querySelectorAll('table.m th.ch-mod')]
  const header = rows.find((th) => th.textContent?.includes(row))
  const j = columns.findIndex((th) => th.textContent?.includes(column))
  const td = header?.closest('tr')?.querySelectorAll('td')[j]
  if (td === undefined) {
    throw new Error(`no cell ${row} → ${column}`)
  }
  return td as HTMLElement
}

beforeEach(() => {
  window.location.hash = ''
  localStorage.clear()
})
afterEach(cleanup)

describe('the shell', () => {
  it('names the repository, the branch against its base, the counts and the tabs', () => {
    render(<App feed={feedOf({})} />)
    const top = screen.getByRole('banner')
    expect(top.textContent).toContain('shop')
    expect(top.textContent).toContain('add-buy against main')
    expect(top.textContent).toContain('6 modules · 4 imports · 5 tiers')
    expect(within(top).getByRole('link', { name: /Breaches/ }).textContent).toBe('Breaches3')
    expect(within(top).getByRole('link', { name: 'Matrix' }).getAttribute('aria-current')).toBe('page')
    expect(top.textContent).toContain('watching, updated just now')
  })

  it('says when the analyzer is away, connecting, or the page is a snapshot', () => {
    const feed = feedOf({ status: 'offline' })
    render(<App feed={feed} />)
    expect(screen.getByRole('banner').textContent).toContain('disconnected, retrying')
    act(() => feed.set({ status: 'live', updatedAt: Date.now() - 12_000 }))
    expect(screen.getByRole('banner').textContent).toContain('updated 12 s ago')
    act(() => feed.set({ status: 'live', updatedAt: Date.now() - 600_000 }))
    expect(screen.getByRole('banner').textContent).toContain('updated 10 min ago')
    cleanup()
    render(<App feed={snapshotFeed(fixture())} />)
    expect(screen.getByRole('banner').textContent).toContain('snapshot')
  })

  it('waits for the first report', () => {
    const feed = feedOf({ report: undefined, status: 'connecting' })
    render(<App feed={feed} />)
    expect(view().textContent).toContain('Waiting for the analyzer')
    act(() => feed.set({ report: fixture() }))
    expect(document.querySelector('table.m')).not.toBeNull()
  })
})

describe('the matrix', () => {
  it('colours each cell by its rule, marks the breach and the addition, and opens on the breach', () => {
    render(<App feed={feedOf({})} />)
    expect(cell('back/flows/buy', 'database').className).toContain('breach')
    expect(cell('back/flows/buy', 'database').className).toContain('add')
    expect(cell('back/flows/buy', 'database').className).toContain('sel')
    expect(cell('api', 'back/flows/buy').className).toContain('ok')
    expect(cell('api', 'database').className).toContain('cond')
    expect(cell('database', 'api').className).toContain('no')
    expect(cell('back/flows/buy', 'back/flows/sell').className).toContain('same')
    expect(cell('api', 'api').className).toBe('diag')
    expect(side().textContent).toContain('Breach')
    expect(side().textContent).toContain('tier: A flow chains domains.')
    expect(side().textContent).toContain("undeclared: Declare @shop/database in @shop/back's package.json.")
    expect(side().textContent).toContain('packages/back/src/flows/buy/index.ts:3')
  })

  it('reads a pair from its cell, and a module from its name', () => {
    render(<App feed={feedOf({})} />)
    fireEvent.click(cell('api', 'database'))
    expect(side().textContent).toContain('Allowed on a condition')
    expect(side().textContent).toContain("{ connect } from '@shop/database'")
    fireEvent.click(cell('database', 'api'))
    expect(side().textContent).toContain('Forbidden')
    expect(side().textContent).toContain('No import between these modules.')
    fireEvent.click(
      within(document.querySelector('table.m') as HTMLElement).getAllByRole('button', {
        name: 'api',
      })[0] as HTMLElement,
    )
    expect(within(side()).getByText('Imports')).toBeTruthy()
    expect(within(side()).getByText('Imported by')).toBeTruthy()
    expect(
      within(side())
        .getByRole('link', { name: /Open module page/ })
        .getAttribute('href'),
    ).toBe('#/module/apps%2Fapi%2Fsrc')
    fireEvent.click(within(side()).getAllByRole('button', { name: /database/ })[0] as HTMLElement)
    expect(side().textContent).toContain('Allowed on a condition')
  })

  it('folds a tier and a group from their headers, and unfolds them from a cell', () => {
    render(<App feed={feedOf({})} />)
    fireEvent.click(screen.getAllByTitle('Collapse Flows')[0] as HTMLElement)
    expect(document.querySelector('table.m')?.textContent).toContain('Flows · 2')
    fireEvent.click(cell('Flows · 2', 'database'))
    expect(document.querySelector('table.m')?.textContent).not.toContain('Flows · 2')
    fireEvent.click(screen.getAllByTitle('Expand web')[0] as HTMLElement)
    expect(document.querySelector('table.m')?.textContent).toContain('web')
    expect(document.querySelectorAll('table.m th.th-mod')).toHaveLength(6)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }))
    expect(document.querySelectorAll('table.m th.th-mod')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(document.querySelectorAll('table.m th.th-mod')).toHaveLength(6)
  })

  it('zooms from its buttons, its keys and the wheel with Ctrl, between 100% and 300%', () => {
    render(<App feed={feedOf({})} />)
    const zoom = () => screen.getByRole('status', { name: 'Zoom level' }).textContent
    fireEvent.click(screen.getByTitle('Zoom in (+)'))
    expect(zoom()).toBe('120%')
    fireEvent.keyDown(document, { key: '+' })
    expect(zoom()).toBe('144%')
    fireEvent.keyDown(document, { key: '-' })
    fireEvent.click(screen.getByTitle('Zoom out (−)'))
    fireEvent.click(screen.getByTitle('Zoom out (−)'))
    expect(zoom()).toBe('100%')
    const scroller = document.querySelector('.scroller') as HTMLElement
    // happy-dom's WheelEvent takes no modifier keys from its init.
    const pinch = new WheelEvent('wheel', { deltaY: -2000, bubbles: true, cancelable: true })
    Object.defineProperty(pinch, 'ctrlKey', { value: true })
    fireEvent(scroller, pinch)
    expect(pinch.defaultPrevented).toBe(true)
    expect(zoom()).toBe('300%')
    fireEvent.wheel(scroller, { deltaY: 100 })
    expect(zoom()).toBe('300%')
    fireEvent.click(screen.getByTitle('Fill the view, from 100% (0)'))
    fireEvent.keyDown(document, { key: '0' })
    expect(zoom()).toBe('100%')
  })

  it('pans by dragging, without selecting the cell the drag ends on', () => {
    render(<App feed={feedOf({})} />)
    const scroller = document.querySelector('.scroller') as HTMLElement
    const target = cell('api', 'database')
    fireEvent.pointerDown(target, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 60, clientY: 70 })
    fireEvent.pointerUp(target, { pointerId: 1 })
    fireEvent.click(target)
    expect(side().textContent).toContain('Breach')
    expect(scroller.classList.contains('panning')).toBe(false)
    fireEvent.click(target)
    expect(side().textContent).toContain('Allowed on a condition')
  })

  it('cuts a long module name in its headers, the full name in their title', () => {
    const report = fixture()
    report.modules.push({
      id: 'packages/back/src/flows/submit-placeholder-analysis',
      tier: 'flows',
      package: '@shop/back',
      files: ['packages/back/src/flows/submit-placeholder-analysis/index.ts'],
    })
    render(<App feed={feedOf({ report })} />)
    const full = 'back/flows/submit-placeholder-analysis'
    const headers = [
      ...document.querySelectorAll('table.m th.th-mod button, table.m th.ch-mod button'),
    ].filter((button) => button.getAttribute('title') === full)
    expect(headers.map((button) => button.textContent)).toEqual([
      'back/flows/submit-placeholder-…',
      'back/flows/submit-placeholder-…',
    ])
    expect(screen.getAllByTitle('back/flows/sell').map((button) => button.textContent)).toEqual([
      'back/flows/sell',
      'back/flows/sell',
    ])
  })

  it('follows the pointer with a band on its row and its column', () => {
    render(<App feed={feedOf({})} />)
    fireEvent.pointerOver(cell('api', 'database'))
    const [row, column] = [...document.querySelectorAll<HTMLElement>('.band')]
    expect(row?.style.opacity).toBe('1')
    expect(column?.style.opacity).toBe('1')
    expect(document.querySelectorAll('th.hl')).toHaveLength(2)
    fireEvent.pointerOver(document.querySelector('.toolbar') as HTMLElement)
    expect(row?.style.opacity).toBe('0')
    expect(document.querySelectorAll('th.hl')).toHaveLength(0)
  })
})

describe('the pages', () => {
  it('shows a module with its tier, package, technologies, links and files', () => {
    render(<App feed={feedOf({})} />)
    go('#/module/packages%2Fback%2Fsrc%2Fflows%2Fbuy')
    expect(view().textContent).toContain('back/flows/buy')
    expect(view().textContent).toContain('Tier Flows')
    expect(view().textContent).toContain('Package @shop/back')
    const breach = view().querySelector('details[open]')
    expect(breach?.textContent).toContain('database')
    expect(breach?.textContent).toContain('breach')
    expect(view().textContent).toContain('condition')
    expect(within(view()).getAllByRole('link', { name: /Open/ })[0]?.getAttribute('href')).toBe(
      '#/module/packages%2Fdatabase',
    )
    go('#/module/apps%2Fapi%2Fsrc')
    expect(view().textContent).toContain('Technologies hono')
    expect(screen.getByRole('navigation', { name: 'Where you are' }).textContent).toContain(
      'back/flows/buy›api',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    go('#/module/nothing')
    expect(view().textContent).toContain('No module nothing')
  })

  it('lists the breaches by rule, with their fix', () => {
    render(<App feed={feedOf({})} />)
    go('#/breaches')
    expect(view().textContent).toContain('tier · 1')
    expect(view().textContent).toContain('unresolved · 1')
    expect(view().textContent).toContain('Fix the specifier.')
    cleanup()
    render(<App feed={feedOf({ report: { ...fixture(), violations: [] } })} />)
    expect(view().textContent).toContain('No breach')
  })

  it('shows the branch against its base and the session’s changes, new ones marked until seen', () => {
    const history: Change[] = [
      {
        at: Date.UTC(2026, 9, 29, 13, 0, 0),
        files: ['apps/api/src/main.ts'],
        added: [['apps/api/src', 'packages/database']],
        removed: [],
        breaches: [],
        fixed: [],
      },
      {
        at: Date.UTC(2026, 9, 29, 14, 0, 0),
        files: ['packages/back/src/flows/buy/index.ts'],
        added: [],
        removed: [['apps/web/src', 'packages/kernel']],
        breaches: [{ rule: 'tier', file: 'x', line: 1, message: 'Flows may not import Adapters.', fix: 'f' }],
        fixed: [{ rule: 'isolated', file: 'x', line: 2, message: 'Two flows.', fix: 'f' }],
      },
    ]
    render(<App feed={feedOf({ history })} />)
    expect(screen.getByRole('link', { name: /Changes/ }).textContent).toBe('Changes2')
    go('#/changes')
    expect(view().textContent).toContain('Against main')
    expect(view().textContent).toContain('+1 −1')
    expect(view().textContent).toContain('back/flows/buy → database')
    expect(view().textContent).toContain('web → kernel')
    expect(view().textContent).toContain('breach: tier, Flows may not import Adapters.')
    expect(view().textContent).toContain('fixed: isolated, Two flows.')
    expect(view().querySelectorAll('.unseen')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as seen' }))
    expect(view().querySelectorAll('.unseen')).toHaveLength(0)
    expect(screen.getByRole('link', { name: /Changes/ }).textContent).toBe('Changes')
  })

  it('says when there is no base and no change yet', () => {
    render(<App feed={feedOf({ report: { ...fixture(), base: null } })} />)
    go('#/changes')
    expect(view().textContent).toContain('No base to compare with')
    expect(view().textContent).toContain('Nothing has changed since the view opened.')
  })

  it('reads the rules tier by tier, each with its URL', () => {
    render(<App feed={feedOf({})} />)
    go('#/rules')
    expect(view().textContent).toContain('What belongs here')
    expect(view().textContent).toContain('One process each.')
    expect(view().textContent).toContain('Technologies it may usehono')
    fireEvent.click(screen.getByRole('button', { name: 'Flows' }))
    expect(window.location.hash).toBe('#/rules/flows')
    go('#/rules/flows')
    expect(view().textContent).toContain('Kerneltypes only')
    expect(view().textContent).toContain('Technologies it may useNone.')
    go('#/rules/web')
    expect(view().textContent).toContain('Nothing: this tier imports no other tier.')
    expect(view().textContent).toContain('Technologies it may useAny.')
  })
})

describe('the source', () => {
  it('opens a file at its line, each import tinted, the breach annotated with its fix', async () => {
    const source =
      "import type { Price } from '@shop/kernel'\n// pricing\nimport { PostgresStore } from '@shop/database'\n"
    render(<App feed={feedOf({}, { 'packages/back/src/flows/buy/index.ts': source })} />)
    await act(async () => {
      fireEvent.click(within(side()).getByRole('button', { name: /index.ts:3/ }))
    })
    const panel = screen.getByRole('complementary', { name: 'Source' })
    expect(panel.className).toContain('open')
    expect(panel.querySelector('.breach-line')?.textContent).toContain('Breach, tier.')
    expect(panel.querySelector('.breach-line')?.textContent).toContain('Breach, undeclared.')
    expect(panel.textContent).toContain('2 breaches')
    expect(panel.querySelector('.imp-line')?.textContent).toContain('imports kernel, Kernel')
    expect(panel.querySelector('.target')?.textContent).toContain('PostgresStore')
    expect(panel.querySelector('.c')?.textContent).toBe('// pricing')
    fireEvent.click(within(panel).getByRole('button', { name: /Close/ }))
    expect(panel.className).not.toContain('open')
  })

  it('tints every line of an import written over several lines, annotated after its last', async () => {
    const file = 'packages/back/src/flows/buy/index.ts'
    const source =
      "import type {\n  Price,\n} from '@shop/kernel'\n// pricing\nimport {\n  PostgresStore } from '@shop/database'\n"
    const report = fixture()
    report.edges = report.edges.map((e) =>
      e.file !== file ? e : e.line === 1 ? { ...e, endLine: 3 } : { ...e, line: 5, endLine: 6 },
    )
    report.violations = report.violations.map((v) => (v.file === file ? { ...v, line: 5 } : v))
    render(<App feed={feedOf({ report }, { [file]: source })} />)
    await act(async () => {
      fireEvent.click(within(side()).getByRole('button', { name: /index.ts:5/ }))
    })
    const lines = [...screen.getByRole('complementary', { name: 'Source' }).querySelectorAll('pre > .l')]
    const kind = (line: Element | undefined) =>
      line?.classList.contains('breach-line')
        ? 'breach'
        : line?.classList.contains('imp-line')
          ? 'import'
          : ''
    expect(lines.slice(0, 6).map(kind)).toEqual(['import', 'import', 'import', '', 'breach', 'breach'])
    const notes = (line: Element | undefined) => [...(line?.querySelectorAll('.go, .note') ?? [])].length
    expect(lines.slice(0, 6).map(notes)).toEqual([0, 0, 1, 0, 0, 2])
    expect(lines[2]?.textContent).toContain('imports kernel, Kernel')
    expect(lines[5]?.textContent).toContain('Breach, tier.')
  })

  it('marks where the file uses each imported name, in its import’s colour', async () => {
    const file = 'packages/back/src/flows/buy/index.ts'
    const source =
      "import type { Price } from '@shop/kernel'\n// pricing\nimport { PostgresStore } from '@shop/database'\nconst store = new PostgresStore()\nexport const price: Price = store.price\n"
    const report = fixture()
    report.edges = report.edges.map((e) =>
      e.file !== file
        ? e
        : e.to === 'packages/kernel'
          ? { ...e, uses: [{ line: 5, column: 20, endColumn: 25 }] }
          : { ...e, uses: [{ line: 4, column: 18, endColumn: 31 }] },
    )
    render(<App feed={feedOf({ report }, { [file]: source })} />)
    await act(async () => {
      fireEvent.click(within(side()).getByRole('button', { name: /index.ts:3/ }))
    })
    const panel = screen.getByRole('complementary', { name: 'Source' })
    const marks = [...panel.querySelectorAll<HTMLElement>('pre .use')].map((mark) => [
      mark.closest('.l')?.firstElementChild?.textContent,
      mark.textContent,
      mark.style.getPropertyValue('--uc'),
    ])
    expect(marks).toEqual([
      ['4', 'PostgresStore', '#9bb35a'],
      ['5', 'Price', '#5fb3a1'],
    ])
    expect(panel.querySelectorAll('pre > .l')[3]?.textContent).toBe('4const store = new PostgresStore()')
    expect(panel.querySelectorAll('pre > .l')[4]?.querySelector('.k')?.textContent).toBe('export')
  })

  it('shows or hides the imports of each module from a legend, the breaches always shown', async () => {
    const source =
      "import type { Price } from '@shop/kernel'\n// pricing\nimport { PostgresStore } from '@shop/database'\n"
    render(<App feed={feedOf({}, { 'packages/back/src/flows/buy/index.ts': source })} />)
    await act(async () => {
      fireEvent.click(within(side()).getByRole('button', { name: /index.ts:3/ }))
    })
    const panel = screen.getByRole('complementary', { name: 'Source' })
    const legend = within(within(panel).getByRole('group', { name: 'Imported modules' }))
    const line = (n: number) => panel.querySelectorAll('pre > .l')[n - 1]
    expect(legend.getAllByRole('button').map((b) => b.textContent)).toEqual(['kernel', 'database'])
    const kernel = legend.getByRole('button', { name: 'kernel' })
    expect(kernel.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(kernel)
    expect(kernel.getAttribute('aria-pressed')).toBe('false')
    expect(line(1)?.className).not.toContain('imp-line')
    expect(line(1)?.textContent).not.toContain('imports kernel')
    fireEvent.click(legend.getByRole('button', { name: 'database' }))
    expect(line(3)?.className).toContain('breach-line')
    expect(line(3)?.textContent).toContain('Breach, tier.')
    fireEvent.click(kernel)
    expect(line(1)?.className).toContain('imp-line')
  })

  it('hides the uses of a module’s names along with its imports', async () => {
    const file = 'packages/back/src/flows/buy/index.ts'
    const source =
      "import type { Price } from '@shop/kernel'\n// pricing\nimport { PostgresStore } from '@shop/database'\nconst store = new PostgresStore()\nexport const price: Price = store.price\n"
    const report = fixture()
    report.edges = report.edges.map((e) =>
      e.file !== file
        ? e
        : e.to === 'packages/kernel'
          ? { ...e, uses: [{ line: 5, column: 20, endColumn: 25 }] }
          : { ...e, uses: [{ line: 4, column: 18, endColumn: 31 }] },
    )
    render(<App feed={feedOf({ report }, { [file]: source })} />)
    await act(async () => {
      fireEvent.click(within(side()).getByRole('button', { name: /index.ts:3/ }))
    })
    const panel = screen.getByRole('complementary', { name: 'Source' })
    const marked = () => [...panel.querySelectorAll('pre .use')].map((mark) => mark.textContent)
    const legend = within(within(panel).getByRole('group', { name: 'Imported modules' }))
    fireEvent.click(legend.getByRole('button', { name: 'database' }))
    expect(marked()).toEqual(['Price'])
    expect(panel.querySelectorAll('pre > .l')[3]?.textContent).toBe('4const store = new PostgresStore()')
    fireEvent.click(legend.getByRole('button', { name: 'database' }))
    expect(marked()).toEqual(['PostgresStore', 'Price'])
  })

  it('says when a file cannot be read, and closes on Escape', async () => {
    render(<App feed={feedOf({})} />)
    go('#/breaches')
    await act(async () => {
      fireEvent.click(within(view()).getByRole('button', { name: /app.tsx:7/ }))
    })
    const panel = screen.getByRole('complementary', { name: 'Source' })
    expect(panel.textContent).toContain('The analyzer does not serve this file')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(panel.className).not.toContain('open')
  })
})

describe("the analyzer's version", () => {
  const built = (fingerprint: string, commit: string, date: string, changed?: string): Identity => ({
    fingerprint,
    commit,
    date,
    modified: changed !== undefined,
    ...(changed === undefined ? {} : { changed }),
  })
  const view = built('f-view', '8158543', '2026-10-30T00:35:57+01:00')
  const banner = () => screen.queryByRole('alert')

  afterEach(cleanup)

  // The two rows of the gap: what the analyzer was built from, what the view expects.
  const rows = () => {
    const values = within(banner() as HTMLElement).getAllByRole('definition')
    return values.map((value) => value.textContent)
  }
  const emphasised = () =>
    [...(banner()?.querySelectorAll('.differs') ?? [])].map((element) => element.textContent)

  it('warns, for good, when the analyzer was built from other sources, setting out the gap', () => {
    const analyzer = built('f-old', 'da9228a', '2026-10-30T00:31:02+01:00', '2026-10-30T07:41:09+01:00')
    render(<App feed={feedOf({ analyzer })} identity={view} />)
    expect(within(banner() as HTMLElement).getByRole('heading').textContent).toBe(
      'The analyzer was built from other sources than this view',
    )
    expect(rows()).toEqual([
      'da9228a2026-10-30 00:31local changes 2026-10-30 07:41sources f-old',
      '81585432026-10-30 00:35no local changessources f-view',
    ])
    // What differs stands out, in both rows.
    expect(emphasised()).toEqual([
      'da9228a',
      '2026-10-30 00:31',
      'local changes 2026-10-30 07:41',
      'sources f-old',
      '8158543',
      '2026-10-30 00:35',
      'no local changes',
      'sources f-view',
    ])
    expect(banner()?.textContent).toContain('cargo build --release')
    expect(within(banner() as HTMLElement).queryByRole('button')).toBeNull()
  })

  it('emphasises only the local changes when both come from one commit', () => {
    const analyzer = built('f-old', '8158543', '2026-10-30T00:35:57+01:00', '2026-10-30T07:41:09+01:00')
    render(
      <App
        feed={feedOf({ analyzer })}
        identity={{ ...view, modified: true, changed: '2026-10-30T07:47:30+01:00' }}
      />,
    )
    expect(emphasised()).toEqual([
      'local changes 2026-10-30 07:41',
      'sources f-old',
      'local changes 2026-10-30 07:47',
      'sources f-view',
    ])
  })

  it('always shows the gap, through the sources, when every other field is the same', () => {
    const analyzer = built('f-old', '8158543', '2026-10-30T00:35:57+01:00', '2026-10-30T07:41:09+01:00')
    render(<App feed={feedOf({ analyzer })} identity={{ ...analyzer, fingerprint: 'f-view' }} />)
    expect(emphasised()).toEqual(['sources f-old', 'sources f-view'])
  })

  // Two formats of what the analyzer sends: the view's reads each edge's uses.
  const formatOf = (edge: Record<string, unknown>) => ({
    type: 'object',
    properties: { report: { $ref: '#/$defs/Report' } },
    $defs: {
      Report: { type: 'object', properties: { edges: { type: 'array', items: { $ref: '#/$defs/Edge' } } } },
      Edge: { type: 'object', properties: edge },
    },
  })
  const viewFormat = formatOf({ from: { type: 'string' }, uses: { type: 'array' } })

  it("warns more gravely when the report is not in the view's format, naming the fields apart", () => {
    const analyzer = built('f-old', 'da9228a', '2026-10-30T00:31:02+01:00')
    render(
      <App
        feed={feedOf({ analyzer, analyzerFormat: formatOf({ from: { type: 'string' } }) })}
        identity={view}
        format={viewFormat}
      />,
    )
    expect(banner()?.classList.contains('format')).toBe(true)
    expect(within(banner() as HTMLElement).getByRole('heading').textContent).toBe(
      "The analyzer's report is not in this view's format",
    )
    expect(banner()?.textContent).toContain('What the view shows is wrong or missing')
    // The two formats line by line, folded until asked for.
    const diff = within(banner() as HTMLElement)
      .getByText('Show the format difference')
      .closest('details')
    expect(diff?.open).toBe(false)
    const removed = [...(diff?.querySelectorAll('pre .removed') ?? [])].map((line) =>
      line.textContent?.trim(),
    )
    expect(removed.some((line) => line?.startsWith('-') && line.includes('"uses": {'))).toBe(true)
    expect(diff?.querySelectorAll('pre .added')).toHaveLength(0)
    expect(rows()).toEqual([
      'report.edges[].uses',
      'da9228a2026-10-30 00:31no local changessources f-old',
      '81585432026-10-30 00:35no local changessources f-view',
    ])
  })

  it('warns gravely when the analyzer reports no format, as one built before formats existed', () => {
    render(
      <App feed={feedOf({ analyzer: null, analyzerFormat: null })} identity={view} format={viewFormat} />,
    )
    expect(banner()?.classList.contains('format')).toBe(true)
    expect(rows()[0]).toBe('no format: built before formats existed')
    expect(within(banner() as HTMLElement).queryByText('Show the format difference')).toBeNull()
  })

  it('stays at the sources level when both send the same format', () => {
    const analyzer = built('f-old', 'da9228a', '2026-10-30T00:31:02+01:00')
    render(
      <App feed={feedOf({ analyzer, analyzerFormat: viewFormat })} identity={view} format={viewFormat} />,
    )
    expect(banner()?.classList.contains('format')).toBe(false)
  })

  it('warns when the analyzer reports no version, as one built before versions existed', () => {
    render(<App feed={feedOf({ analyzer: null })} identity={view} />)
    expect(rows()).toEqual([
      'no version: built before versions existed, or without Node',
      '81585432026-10-30 00:35no local changessources f-view',
    ])
  })

  it('opens a file from a report in another format, shown without its marks, saying why', async () => {
    const file = 'packages/back/src/flows/buy/index.ts'
    const source = "import type { Price } from '@shop/kernel'\n// pricing\nexport const price = 1\n"
    const report = fixture()
    // What an analyzer older than the view sends: edges without their uses.
    report.edges = report.edges.map(({ uses: _, ...older }) => older as (typeof report.edges)[number])
    // The hash the shared set-up cleared changes after a tick, which closes the panel.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const silenced = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <App
        feed={feedOf({ report, analyzer: null, analyzerFormat: null }, { [file]: source })}
        identity={view}
        format={viewFormat}
      />,
    )
    await act(async () => {
      fireEvent.click(within(side()).getByRole('button', { name: /index.ts:3/ }))
    })
    silenced.mockRestore()
    expect(banner()?.classList.contains('format')).toBe(true)
    const panel = screen.getByRole('complementary', { name: 'Source' })
    expect(panel.classList.contains('open')).toBe(true)
    expect(panel.textContent).toContain(file)
    expect(within(panel).getByRole('button', { name: /Close/ })).toBeDefined()
    // Why the marks are missing, at the head of the code.
    expect(within(panel).getByRole('status').textContent).toMatch(
      /Shown without its imports marked.*not in this view's format/,
    )
    // The file itself, line by line.
    expect([...panel.querySelectorAll('pre > .l')].map((line) => line.textContent)).toEqual([
      "1import type { Price } from '@shop/kernel'",
      '2// pricing',
      '3export const price = 1',
      '4 ',
    ])
  })

  it('says nothing when both come from the same sources, or before the analyzer answered', () => {
    render(
      <App
        feed={feedOf({ analyzer: built('f-view', 'other', '2026-10-29T10:00:00+01:00') })}
        identity={view}
      />,
    )
    expect(banner()).toBeNull()
    cleanup()
    render(<App feed={feedOf({})} identity={view} />)
    expect(banner()).toBeNull()
  })
})
