import { describe, expect, it } from 'vitest'
import { catalogues, translator } from './index.ts'

function keysOf(catalogue: object): string[] {
  return Object.keys(catalogue).sort()
}

describe('message catalogues', () => {
  it('every language has exactly the keys of the reference catalogue, English', () => {
    for (const [language, catalogue] of Object.entries(catalogues)) {
      expect({ language, keys: keysOf(catalogue) }).toEqual({ language, keys: keysOf(catalogues.en) })
    }
  })

  it('no message is empty', () => {
    for (const [language, catalogue] of Object.entries(catalogues)) {
      for (const [key, message] of Object.entries(catalogue)) {
        expect({ language, key, empty: message.trim() === '' }).toEqual({ language, key, empty: false })
      }
    }
  })

  it('picks the reader language among those available, English otherwise', () => {
    expect(translator(['fr-FR', 'en'])('signIn.title')).toBe(catalogues.fr['signIn.title'])
    expect(translator(['de-DE'])('signIn.title')).toBe(catalogues.en['signIn.title'])
  })
})
