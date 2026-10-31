import { useState } from 'react'
import { api } from '../../shared/api/index.ts'
import type { Translate } from '../../shared/i18n/index.ts'

export function ConsentPage({ t }: { t: Translate }) {
  const [failed, setFailed] = useState(false)
  const client = new URLSearchParams(window.location.search).get('client_id') ?? ''

  async function answer(accept: boolean) {
    // The authorization request the server signed, which the answer completes.
    const outcome = await api.call('consent', { accept, oauthQuery: window.location.search.slice(1) })
    if (!outcome.ok) {
      setFailed(true)
      return
    }
    window.location.assign(outcome.value.next)
  }

  return (
    <main>
      <h1>{t('consent.title')}</h1>
      <p>{t('consent.explanation', { client })}</p>
      {failed ? <p role="alert">{t('error.unexpected')}</p> : null}
      <button type="button" onClick={() => answer(true)}>
        {t('consent.allow')}
      </button>
      <button type="button" onClick={() => answer(false)}>
        {t('consent.deny')}
      </button>
    </main>
  )
}
