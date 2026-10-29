// A static build of the view: the analyzer's report written into the page, which
// then reads it instead of a live analyzer.

const PLACE = '<script type="application/json" id="snapshot"></script>'

export function embedSnapshot(html: string, report: string): string {
  if (!html.includes(PLACE)) {
    throw new Error('the page has no snapshot script to fill')
  }
  // Reformatted, so it is JSON; "<" escaped, so nothing in it closes the script.
  const json = JSON.stringify(JSON.parse(report)).replaceAll('<', '\\u003c')
  // A function, so a "$" in the report is never read as a replacement pattern.
  return html.replace(PLACE, () => PLACE.replace('></script>', () => `>${json}</script>`))
}
