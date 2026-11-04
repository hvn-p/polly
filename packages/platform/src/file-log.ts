// What a file imports to log, as `@polly/platform/log`. The build plugin
// (scripts/build/log-plugin.ts) resolves that import, per importing file, to a
// logger tagged with the file's tier, module and path: this module only stands
// for it in the type check, and fails a file built without the plugin.

import type { Log } from './log.ts'

export const log: Log = () => {
  throw new Error(
    'this file was built without the log plugin (scripts/build/log-plugin.ts), which tags its logger',
  )
}
