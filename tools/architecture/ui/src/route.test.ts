import { describe, expect, it } from 'vitest'
import { crumbsOf, parseRoute, trailAfter } from './route.ts'

describe('a view’s URL', () => {
  it('names the page and its argument', () => {
    expect(parseRoute('')).toEqual({ page: 'matrix' })
    expect(parseRoute('#/breaches')).toEqual({ page: 'breaches' })
    expect(parseRoute('#/module/packages%2Fdatabase')).toEqual({ page: 'module', arg: 'packages/database' })
    expect(parseRoute('#/rules/flows')).toEqual({ page: 'rules', arg: 'flows' })
    expect(parseRoute('#/nowhere')).toEqual({ page: 'matrix' })
  })
})

describe('the trail of views visited', () => {
  it('starts again at a tab, grows with module pages, and goes back to a page already in it', () => {
    let trail = trailAfter([], '#/matrix')
    expect(trail).toEqual(['#/matrix'])
    trail = trailAfter(trail, '#/module/a')
    trail = trailAfter(trail, '#/module/b')
    expect(trail).toEqual(['#/matrix', '#/module/a', '#/module/b'])
    expect(trailAfter(trail, '#/module/a')).toEqual(['#/matrix', '#/module/a'])
    expect(trailAfter(trail, '#/rules')).toEqual(['#/rules'])
  })

  it('shows its first step and its last four when it is long', () => {
    const trail = ['#/matrix', ...['a', 'b', 'c', 'd', 'e', 'f'].map((m) => `#/module/${m}`)]
    expect(crumbsOf(trail)).toEqual([
      '#/matrix',
      null,
      '#/module/c',
      '#/module/d',
      '#/module/e',
      '#/module/f',
    ])
    expect(crumbsOf(trail.slice(0, 3))).toEqual(trail.slice(0, 3))
  })
})
