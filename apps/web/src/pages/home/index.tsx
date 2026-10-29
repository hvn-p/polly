import { useEffect, useState } from 'react'
import { api } from '../../shared/api/index.ts'
import type { Translate } from '../../shared/i18n/index.ts'

// The learner the API names, null when signed out, undefined while it answers.
type Learner = { name: string } | null | undefined

export function HomePage({ t }: { t: Translate }) {
  const [learner, setLearner] = useState<Learner>()
  useEffect(() => {
    void api.call('getMe').then((outcome) => setLearner(outcome.ok ? outcome.value : null))
  }, [])
  if (learner === undefined) {
    return null
  }
  return (
    <main>
      <h1>{t('app.name')}</h1>
      {learner === null ? (
        <p>
          {t('home.signedOut')} <a href="/sign-in">{t('home.signIn')}</a>
        </p>
      ) : (
        <p>{t('home.signedInAs', { name: learner.name })}</p>
      )}
    </main>
  )
}
