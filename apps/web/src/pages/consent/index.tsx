import { useState } from 'react'
import { authClient, nextLocation } from '../../shared/auth/index.ts'
import type { Translate } from '../../shared/i18n/index.ts'

export function ConsentPage({ t }: { t: Translate }) {
  const [failed, setFailed] = useState(false)
  const client = new URLSearchParams(window.location.search).get('client_id') ?? ''

  async function answer(accept: boolean) {
    const { data, error } = await authClient.oauth2.consent({ accept })
    const next = nextLocation(data)
    if (error !== null || next === undefined) {
      setFailed(true)
      return
    }
    window.location.assign(next)
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
