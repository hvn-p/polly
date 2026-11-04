import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConsentPage } from '../pages/consent/index.tsx'
import { HomePage } from '../pages/home/index.tsx'
import { SignInPage } from '../pages/sign-in/index.tsx'
import { readerLanguage, translator } from '../shared/i18n/index.ts'

const t = translator(navigator.languages)
document.documentElement.lang = readerLanguage(navigator.languages)

const pages = { '/sign-in': SignInPage, '/consent': ConsentPage } as const
const Page = pages[window.location.pathname as keyof typeof pages] ?? HomePage

const root = document.getElementById('root')
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <Page t={t} />
    </StrictMode>,
  )
}
