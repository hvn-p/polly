import { type FormEvent, useState } from 'react'
import { api } from '../../shared/api/index.ts'
import type { MessageKey, Translate } from '../../shared/i18n/index.ts'
import { EMAIL, PASSWORD, signInProblem } from './bounds.ts'

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
    // The authorization request an agent's sign-in is part of, signed by the
    // server, which it resumes once the learner is signed in.
    const oauthQuery = window.location.search.slice(1)
    const outcome = await api.call('signIn', {
      email,
      password,
      ...(oauthQuery === '' ? {} : { oauthQuery }),
    })
    if (!outcome.ok) {
      setProblem(outcome.code === 'INVALID_EMAIL_OR_PASSWORD' ? 'signIn.refused' : 'error.unexpected')
      return
    }
    window.location.assign(outcome.value.next ?? '/')
  }

  return (
    <main>
      <h1>{t('signIn.title')}</h1>
      <form onSubmit={submit} noValidate>
        <label>
          {t('signIn.email')}
          <input
            name="email"
            type="email"
            autoComplete="username"
            minLength={EMAIL.min}
            maxLength={EMAIL.max}
            required
          />
        </label>
        <label>
          {t('signIn.password')}
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={PASSWORD.min}
            maxLength={PASSWORD.max}
            required
          />
        </label>
        {problem === undefined ? null : <p role="alert">{t(problem)}</p>}
        <button type="submit">{t('signIn.submit')}</button>
      </form>
    </main>
  )
}
