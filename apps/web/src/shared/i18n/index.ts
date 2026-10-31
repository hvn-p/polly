// The interface's texts, from one catalogue per language. A component never
// holds a displayed text of its own.

import { en, type MessageKey } from './catalogues/en.ts'
import { fr } from './catalogues/fr.ts'

export type { MessageKey }

export const catalogues = { en, fr } satisfies Record<string, Record<MessageKey, string>>

export type Language = keyof typeof catalogues

export type Translate = (key: MessageKey, values?: Record<string, string>) => string

function isLanguage(code: string): code is Language {
  return code in catalogues
}

// The first of the reader's languages Polly speaks, English otherwise.
export function readerLanguage(languages: readonly string[]): Language {
  return languages.map((tag) => tag.split('-')[0] ?? '').find(isLanguage) ?? 'en'
}

export function translator(languages: readonly string[]): Translate {
  const catalogue: Record<MessageKey, string> = catalogues[readerLanguage(languages)]
  return (key, values = {}) =>
    catalogue[key].replace(/\{(\w+)\}/g, (placeholder, name: string) => values[name] ?? placeholder)
}
