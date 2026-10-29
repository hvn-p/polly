# Local development environment

Each worktree runs its own Polly at its own URL, on its own data: a database, a
test database and a bucket in the machine's shared Postgres and Garage, and a
supervisor that runs the worktree's API, front-end dev server and worker.

## Prerequisites

Linux or macOS (Windows through WSL) with Node 24 and Docker with compose; pnpm comes
through Corepack (`corepack enable`), at the version `packageManager` fixes. Every other
tool is a project dependency. One step is machine-wide: portless's proxy binds 443 and
trusts its local CA, started once with `dev/node_modules/.bin/portless proxy start`.
worktrunk runs `nr dev:up` and `nr dev:down` around a worktree's life. `nr dev:up` checks
the prerequisites and names what is missing.

## Commands

Every command acts on the worktree it runs in.

| Command | Does |
|---|---|
| `nr dev:up` | Creates what is missing, migrates, seeds the demo account, starts the processes, prints the URL. Safe to run again: it repairs a stopped or partly set up worktree. |
| `nr dev:down` | Stops the processes and releases the worktree's databases, bucket and route. |
| `nr dev:url` | Prints the worktree's URL. |
| `nr dev:worker real [--compute <fingerprint>]` / `nr dev:worker fake` | Restarts the worktree's worker with the machine's compute service for its fingerprint of `services/compute` (or the one named), or with the fake analyzer that loads none. Worktrees with the same fingerprint share one service; `nr dev:down` puts the worktree back in fake mode. |
| `nr dev:e2e <scenario>` | Plays a scenario (`smoke`) in a driven Claude Code session against this worktree, then prints pass or fail and the transcript's path. Needs `claude` signed in and util-linux `script`; never runs in CI. |
| `nr agent` | Starts Claude Code with this worktree's plugin, pointed at this worktree's server. |

worktrunk runs `dev:up` when it creates a worktree and `dev:down` when it
removes one, so `wt switch -c <branch> -x 'nr agent'` creates a worktree and
starts a session in it.

`nr dev:down` then `nr dev:up` resets the worktree: an empty, migrated database
with the demo account.

## Where things are

- `.env.local`: the worktree's configuration, generated from
  [`env.template`](env.template). Generated values are never rewritten.
- `.dev/logs/api.log`, `.dev/logs/web.log`, `.dev/logs/worker.log`: the output of each
  process.
- `.dev/state.json`: what `dev:down` releases.

## Demo account

A local-only learner, created by `dev:up`:

| Field | Value |
|---|---|
| Email | `demo@polly.localhost` |
| Password | `polly-demo-learner` |

These credentials are public on purpose: the account never exists outside
the local environment.

## Signing in as the demo learner with agent-browser

Sign-in goes through the real flow; there is no shortcut. The browser must trust
portless's local CA:

```sh
url=$(nr --silent dev:url)
ab="dev/node_modules/.bin/agent-browser --ca-cert $HOME/.portless/ca.pem"
$ab open "$url/sign-in"
$ab fill 'input[name=email]' demo@polly.localhost
$ab fill 'input[name=password]' polly-demo-learner
$ab click 'button[type=submit]'
```

The home page then reads "Signed in as Demo Learner." When an OAuth client (the
MCP) started the flow, the same form appears and leads to the consent page:
`$ab find role button click --name Allow`.
