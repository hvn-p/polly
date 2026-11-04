// The command-line tools the dev commands run from the project's
// dependencies, by path: the machine provides none of them.

import { join } from 'node:path'

const bin = join(import.meta.dirname, '..', '..', 'node_modules', '.bin')

export const PORTLESS = join(bin, 'portless')
export const AGENT_BROWSER = join(bin, 'agent-browser')
