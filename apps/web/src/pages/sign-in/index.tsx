import { type FormEvent, useState } from 'react'
import { authClient, nextLocation } from '../../shared/auth/index.ts'
import type { MessageKey, Translate } from '../../shared/i18n/index.ts'
import { signInProblem } from './bounds.ts'

export function SignInPage({ t }: { t: Translate }) {
  const [problem, setProblem] = useState<MessageKey>()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email'))
    const password = String(form.get('password'))
    const invalid = signInProblem(email, password)
    if (invalid !== undefined) {
      setProblem(invalid)
      return
    }
    const { data, error } = await authClient.signIn.email({ email, password })
    if (error !== null) {
      setProblem(error.status === 401 ? 'signIn.refused' : 'error.unexpected')
      return
    }
    window.location.assign(nextLocation(data) ?? '/')
  }

  return (
    <main>
      <h1>{t('signIn.title')}</h1>
      <form onSubmit={submit} noValidate>
        <label>
          {t('signIn.email')}
          <input name="email" type="email" autoComplete="username" minLength={3} maxLength={254} required />
        </label>
        <label>
          {t('signIn.password')}
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={8}
            maxLength={128}
            required
          />
        </label>
        {problem === undefined ? null : <p role="alert">{t(problem)}</p>}
        <button type="submit">{t('signIn.submit')}</button>
      </form>
    </main>
  )
}
