// The views behind the tabs other than the matrix, and a module's page.

import { changeLines, labelOf, ruleOf, tierName, tierOfModule } from './model.ts'
import { Chevron, ImportLine, moduleHref, Outward, plural, TierTag, useView } from './parts.tsx'
import type { Change, Edge, Pair } from './types.ts'

export function ModulePage({ id }: { id: string }) {
  const { model, openSource } = useView()
  const module = model.moduleById.get(id)
  if (module === undefined) {
    return (
      <div className="pg">
        <h1>No module {id}</h1>
      </div>
    )
  }
  const technologies = [
    ...new Set(model.report.technologies.filter((t) => t.module === id).map((t) => t.name)),
  ]
  return (
    <div className="pg">
      <div className="hero">
        <span className="stn" style={{ color: model.colour[module.tier] }} />
        <h1>{labelOf(model, id)}</h1>
      </div>
      <p className="sub mono">{id}</p>
      <div className="facts">
        <span>
          Tier <b>{tierName(model, module.tier)}</b>
        </span>
        <span>
          Package <b>{module.package}</b>
        </span>
        <span>
          <b>{module.files.length}</b> file{module.files.length === 1 ? '' : 's'}
        </span>
        <span>
          Technologies <b>{technologies.join(', ') || 'none'}</b>
        </span>
      </div>
      <div className="cols">
        <Lane title="Imports" id={id} edges={model.report.edges.filter((e) => e.from === id)} other="to" />
        <Lane
          title="Imported by"
          id={id}
          edges={model.report.edges.filter((e) => e.to === id)}
          other="from"
        />
      </div>
      <h3>Files</h3>
      {module.files.map((file) => (
        <button type="button" key={file} className="imp" onClick={() => openSource(file, 1)}>
          <span className="file mono">{file}</span>
        </button>
      ))}
    </div>
  )
}

// One direction of a module's links, grouped by tier; each linked module folds
// its import lines, open when one breaks a rule.
function Lane({
  title,
  id,
  edges,
  other,
}: {
  title: string
  id: string
  edges: Edge[]
  other: 'to' | 'from'
}) {
  const { model } = useView()
  const byOther = Map.groupBy(edges, (e) => e[other])
  const tierOrder = (m: string) => model.order.get(tierOfModule(model, m)) ?? 0
  const others = [...byOther.keys()].sort((a, b) => tierOrder(a) - tierOrder(b))
  const tiers = [...new Set(others.map((m) => tierOfModule(model, m)))]
  return (
    <section className="lane">
      <h2>
        {title} <span className="count">{plural(others.length, 'module')}</span>
      </h2>
      {tiers.length === 0 ? <p className="empty">None.</p> : null}
      {tiers.map((tier) => (
        <div className="tgroup" key={tier}>
          {others
            .filter((m) => tierOfModule(model, m) === tier)
            .map((m) => {
              const lines = byOther.get(m) ?? []
              const [from, to] = other === 'to' ? [id, m] : [m, id]
              const rule = ruleOf(model, tierOfModule(model, from), tierOfModule(model, to))
              const breach = lines.some((e) => model.breachesOf(e).length > 0)
              return (
                <details className="link" key={m} open={breach}>
                  <summary>
                    <Chevron />
                    <span className="to">
                      <TierTag id={m} />
                      <span className="mono">{labelOf(model, m)}</span>
                    </span>
                    {breach ? (
                      <span className="tag breach">breach</span>
                    ) : rule.kind === 'cond' ? (
                      <span className="tag cond">condition</span>
                    ) : (
                      <span />
                    )}
                    <span className="mute">{plural(lines.length, 'import line')}</span>
                    <a
                      className="openmod"
                      href={moduleHref(m)}
                      title={`Open the page of ${labelOf(model, m)}`}
                    >
                      Open <Outward />
                    </a>
                  </summary>
                  {lines.map((e) => (
                    <ImportLine key={`${e.file}:${e.line}`} edge={e} />
                  ))}
                </details>
              )
            })}
        </div>
      ))}
    </section>
  )
}

export function BreachesPage() {
  const { model, openSource } = useView()
  const byRule = Map.groupBy(model.report.violations, (v) => v.rule)
  return (
    <div className="pg">
      <h1>Breaches</h1>
      <p className="sub">
        Every import the rules refuse, grouped by rule. Open one to read it in its source.
      </p>
      {byRule.size === 0 ? <p className="empty">No breach: the repository follows its rules.</p> : null}
      {[...byRule].map(([rule, violations]) => (
        <section key={rule}>
          <h3>
            {rule} · {violations.length}
          </h3>
          <div className="rows">
            {violations.map((v) => (
              <div className="r" key={`${v.file}:${v.line}:${v.rule}`}>
                <span className="tag breach">{rule}</span>
                <div>
                  <button type="button" className="imp bare" onClick={() => openSource(v.file, v.line)}>
                    <span className="file mono">
                      {v.file}:{v.line}
                    </span>
                  </button>
                  <p>{v.message}</p>
                  <p className="mute">{v.fix}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

const time = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function ChangesPage({
  history,
  seen,
  onSeen,
}: {
  history: Change[]
  seen: number
  onSeen: () => void
}) {
  const { model, openSource } = useView()
  const base = model.report.base
  const pair = ([from, to]: Pair) => `${labelOf(model, from)} → ${labelOf(model, to)}`
  const unseen = history.filter((c) => c.at > seen).length
  return (
    <div className="pg">
      <h1>Changes</h1>
      <p className="sub">
        What this branch changes against {base?.ref ?? 'its base'}, and what changed since this session
        started.
      </p>
      <div className="cols">
        <section className="lane">
          {base === null ? (
            <>
              <h2>Against a base</h2>
              <p className="empty">No base to compare with: the analyzer runs without --base.</p>
            </>
          ) : (
            <>
              <h2>
                Against {base.ref}{' '}
                <span className="count">
                  +{base.added.length} −{base.removed.length}
                </span>
              </h2>
              <div className="rows">
                {base.added.map((p) => (
                  <div className="r" key={`+${p.join('>')}`}>
                    <span className="plus">added</span>
                    <a className="plus mono" href={moduleHref(p[0])}>
                      {pair(p)}
                    </a>
                  </div>
                ))}
                {base.removed.map((p) => (
                  <div className="r" key={`-${p.join('>')}`}>
                    <span className="minus">removed</span>
                    <span className="minus mono">{pair(p)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
        <section className="lane">
          <h2>
            This session {unseen > 0 ? <span className="count new">{unseen} new</span> : null}
            {unseen > 0 ? (
              <button type="button" className="chip" onClick={onSeen}>
                Mark all as seen
              </button>
            ) : null}
          </h2>
          {history.length === 0 ? <p className="empty">Nothing has changed since the view opened.</p> : null}
          <div className="rows">
            {[...history].reverse().map((change) => (
              <div
                className={`r${change.at > seen ? ' unseen' : ''}`}
                key={`${change.at}:${change.files.join()}`}
              >
                <span className="when">{time(change.at)}</span>
                <div className="ch">
                  {change.files.map((file) => (
                    <button type="button" key={file} className="imp bare" onClick={() => openSource(file, 1)}>
                      <span className="file mono">{file}</span>
                    </button>
                  ))}
                  {changeLines(model, change).map((line) =>
                    line.kind === 'added' || line.kind === 'removed' ? (
                      <span
                        key={line.kind + line.text}
                        className={`${line.kind === 'added' ? 'plus' : 'minus'} mono`}
                      >
                        {line.kind === 'added' ? '+' : '−'} {line.text}
                      </span>
                    ) : (
                      <span
                        key={line.kind + line.text}
                        className={`tag${line.kind === 'breach' ? ' breach' : ''}`}
                      >
                        {line.kind}: {line.text}
                      </span>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

const KIND_WORDS = { ok: 'allowed', cond: 'allowed on a condition', no: 'forbidden', same: 'same tier' }

export function RulesPage({ tier }: { tier: string | undefined }) {
  const { model } = useView()
  const selected = model.tierById.get(tier ?? '') ?? model.tiers[0]
  if (selected === undefined) {
    return (
      <div className="pg">
        <h1>Rules</h1>
        <p className="empty">The rules file names no tier.</p>
      </div>
    )
  }
  const modules = model.modules.filter((m) => m.tier === selected.id)
  const pick = (id: string) => {
    window.location.hash = `#/rules/${id}`
  }
  return (
    <div className="pg">
      <h1>Rules</h1>
      <p className="sub">
        Who may import whom, from <span className="mono">architecture.rules.json</span>. Rows import columns;
        click a tier to read its rule.
      </p>
      <div className="key">
        <span className="k">
          <i style={{ background: '#22301f' }} />
          allowed
        </span>
        <span className="k">
          <i style={{ background: '#3b3319' }} />
          on a condition
        </span>
        <span className="k">
          <i style={{ background: '#2c1b18' }} />
          forbidden
        </span>
      </div>
      <div className="rl">
        <table className="tm">
          <thead>
            <tr>
              <th />
              {model.tiers.map((c) => (
                <th className="c" key={c.id}>
                  <span>{c.name}</span>
                  <i style={{ background: model.colour[c.id] }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.groups.map((group) => [
              <tr className="gl" key={`gap:${group}`}>
                <td colSpan={model.tiers.length + 1} />
              </tr>,
              ...model.tiers
                .filter((r) => r.group === group)
                .map((r) => (
                  <tr className={r.id === selected.id ? 'on' : ''} key={r.id}>
                    <th className={`r${r.id === selected.id ? ' on' : ''}`}>
                      <button type="button" onClick={() => pick(r.id)}>
                        <i style={{ background: model.colour[r.id] }} />
                        {r.name}
                      </button>
                    </th>
                    {model.tiers.map((c) => {
                      const kind = ruleOf(model, r.id, c.id).kind
                      return (
                        // biome-ignore lint/a11y/useKeyWithClickEvents: the row's tier button does the same from the keyboard.
                        <td
                          key={c.id}
                          className={kind}
                          title={`${r.name} → ${c.name}: ${KIND_WORDS[kind]}`}
                          onClick={() => pick(r.id)}
                        />
                      )
                    })}
                  </tr>
                )),
            ])}
          </tbody>
        </table>
        <section className="tdet">
          <div className="name">
            <i style={{ background: model.colour[selected.id] }} />
            <h2>{selected.name}</h2>
            <span className="mute">{selected.group} group</span>
          </div>
          <h4>What belongs here</h4>
          <p className="big">{selected.criterion}</p>
          <h4>May import</h4>
          <ul>
            {selected.mayImport.length === 0 ? (
              <li className="mute">Nothing: this tier imports no other tier.</li>
            ) : (
              selected.mayImport.map((entry) => {
                const id = typeof entry === 'string' ? entry : entry.tier
                const conditions =
                  typeof entry === 'string'
                    ? []
                    : [
                        entry.typesOnly && 'types only',
                        entry.onlyFrom.length > 0 && `only from ${entry.onlyFrom.join(', ')}`,
                      ]
                const condition = conditions.filter(Boolean).join('; ')
                return (
                  <li key={id}>
                    <i className="ln" style={{ background: model.colour[id] }} />
                    {tierName(model, id)}
                    {condition ? <span className="cond">{condition}</span> : null}
                  </li>
                )
              })
            )}
          </ul>
          {selected.isolated ? (
            <>
              <h4>Within the tier</h4>
              <p>{selected.isolated}</p>
            </>
          ) : null}
          <h4>Technologies it may use</h4>
          <p>
            {selected.technologies == null
              ? 'Any.'
              : selected.technologies.length === 0
                ? 'None.'
                : selected.technologies.map((t, k) => (
                    <span key={t}>
                      {k > 0 ? ', ' : ''}
                      <code>{t}</code>
                    </span>
                  ))}
          </p>
          <h4>Paths, and the modules they make</h4>
          <div className="paths">
            {selected.paths.map((p) => (
              <code key={p}>{p}</code>
            ))}
          </div>
          <p className="mute modules">
            {plural(modules.length, 'module')}:{' '}
            {modules.length === 0
              ? 'none yet'
              : modules.map((m, k) => (
                  <span key={m.id}>
                    {k > 0 ? ', ' : ''}
                    <a href={moduleHref(m.id)}>{labelOf(model, m.id)}</a>
                  </span>
                ))}
          </p>
          <h4>When it is breached</h4>
          <p>{selected.fix}</p>
        </section>
      </div>
    </div>
  )
}
