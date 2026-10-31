import { describe, expect, it } from 'vitest'
import { plain, shellQuoted } from './terminal.ts'

describe("a pseudo-terminal's text", () => {
  it('drops colour, cursor and title escapes, keeping the text', () => {
    expect(plain('\x1b[1;32mPASS\x1b[0m \x1b[?25lok\x1b]0;title\x07 done\x1b]8;;url\x1b\\')).toBe(
      'PASS ok done',
    )
  })
})

describe('a shell argument', () => {
  it('is single-quoted, a quote inside it closed and escaped', () => {
    expect(shellQuoted('claude')).toBe("'claude'")
    expect(shellQuoted("it's $HOME")).toBe("'it'\\''s $HOME'")
  })
})
