// Each view has its URL, in the hash: #/matrix, #/breaches, #/changes,
// #/rules[/<tier>], #/module/<id>. The trail is the views visited since the
// last tab, for the breadcrumb and Back.

export type Page = 'matrix' | 'breaches' | 'changes' | 'rules' | 'module'

export interface Route {
  page: Page
  arg?: string
}

const PAGES: readonly string[] = ['matrix', 'breaches', 'changes', 'rules', 'module']

export function parseRoute(hash: string): Route {
  const [, page = 'matrix', arg] = hash.split('/')
  if (!PAGES.includes(page)) {
    return { page: 'matrix' }
  }
  return arg === undefined ? { page: page as Page } : { page: page as Page, arg: decodeURIComponent(arg) }
}

export function trailAfter(trail: string[], hash: string): string[] {
  if (parseRoute(hash).page !== 'module') {
    return [hash]
  }
  const at = trail.indexOf(hash)
  return at >= 0 ? trail.slice(0, at + 1) : [...trail, hash]
}

// The steps shown: all of them, or the first, a gap (null), and the last four.
export function crumbsOf(trail: string[]): (string | null)[] {
  return trail.length > 6 ? [trail[0] ?? '#/matrix', null, ...trail.slice(-4)] : trail
}
