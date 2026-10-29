import { describe, expect, it } from 'vitest'
import { embedSnapshot } from './snapshot.ts'
import { fixture } from './test/fixture.ts'

const page = '<body><div id="root"></div><script type="application/json" id="snapshot"></script></body>'

describe('a snapshot built into the page', () => {
  it('holds the report the view reads back', () => {
    const html = embedSnapshot(page, JSON.stringify(fixture()))
    const document = new DOMParser().parseFromString(html, 'text/html')
    const text = document.getElementById('snapshot')?.textContent ?? ''
    expect(JSON.parse(text)).toEqual(fixture())
  })

  it('cannot close its script, whatever the report says', () => {
    const report = { ...fixture(), name: '</script><script>alert(1)</script>' }
    const html = embedSnapshot(page, JSON.stringify(report))
    expect(html).not.toContain('</script><script>alert')
    const document = new DOMParser().parseFromString(html, 'text/html')
    expect(document.querySelectorAll('script')).toHaveLength(1)
    expect(JSON.parse(document.getElementById('snapshot')?.textContent ?? '').name).toBe(report.name)
  })

  it('refuses a page without its place, or a report that is not JSON', () => {
    expect(() => embedSnapshot('<body></body>', '{}')).toThrow('no snapshot script')
    expect(() => embedSnapshot(page, 'not json')).toThrow()
  })
})
