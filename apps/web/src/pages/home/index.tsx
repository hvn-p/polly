import { authClient } from '../../shared/auth/index.ts'
import type { Translate } from '../../shared/i18n/index.ts'

export function HomePage({ t }: { t: Translate }) {
  const { data, isPending } = authClient.useSession()
  if (isPending) {
    return null
  }
  return (
    <main>
      <h1>{t('app.name')}</h1>
      {data === null ? (
        <p>
          {t('home.signedOut')} <a href="/sign-in">{t('home.signIn')}</a>
        </p>
      ) : (
        <p>{t('home.signedInAs', { name: data.user.name })}</p>
      )}
    </main>
  )
}
