import type { MessageKey } from './en.ts'

export const fr: Record<MessageKey, string> = {
  'app.name': 'Polly',
  'home.signedInAs': 'Connecté en tant que {name}.',
  'home.signedOut': 'Vous n’êtes pas connecté.',
  'home.signIn': 'Se connecter',
  'signIn.title': 'Se connecter à Polly',
  'signIn.email': 'E-mail',
  'signIn.password': 'Mot de passe',
  'signIn.submit': 'Se connecter',
  'signIn.emailInvalid': 'Saisissez une adresse e-mail de {min} à {max} caractères.',
  'signIn.passwordInvalid': 'Saisissez un mot de passe de {min} à {max} caractères.',
  'signIn.refused': 'Cet e-mail et ce mot de passe ne correspondent à aucun compte.',
  'consent.title': 'Autoriser l’accès à Polly',
  'consent.explanation': '{client} demande à utiliser Polly en votre nom.',
  'consent.allow': 'Autoriser',
  'consent.deny': 'Refuser',
  'error.unexpected': 'Une erreur est survenue. Réessayez.',
}
