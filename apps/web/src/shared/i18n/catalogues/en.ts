// The reference catalogue: every other language has exactly these keys.
export const en = {
  'app.name': 'Polly',
  'home.signedInAs': 'Signed in as {name}.',
  'home.signedOut': 'You are not signed in.',
  'home.signIn': 'Sign in',
  'signIn.title': 'Sign in to Polly',
  'signIn.email': 'Email',
  'signIn.password': 'Password',
  'signIn.submit': 'Sign in',
  'signIn.emailInvalid': 'Enter an email address of 3 to 254 characters.',
  'signIn.passwordInvalid': 'Enter a password of 8 to 128 characters.',
  'signIn.refused': 'This email and password do not match an account.',
  'consent.title': 'Allow access to Polly',
  'consent.explanation': '{client} asks to use Polly on your behalf.',
  'consent.allow': 'Allow',
  'consent.deny': 'Deny',
  'error.unexpected': 'Something went wrong. Try again.',
}

export type MessageKey = keyof typeof en
