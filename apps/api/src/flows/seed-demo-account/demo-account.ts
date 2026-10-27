// The demo learner's credentials: public on purpose (dev/README.md), since the
// account exists only locally. The seed creates it; the end-to-end run signs
// it in. It imports nothing, so a process outside the API can read it.

export const DEMO_ACCOUNT = {
  name: 'Demo Learner',
  email: 'demo@polly.localhost',
  password: 'polly-demo-learner',
}
