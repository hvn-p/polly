# speckit

The working directory for what Spec Kit does differently in polly. Any change to the
`issue-sync` extension or the `polly` preset is made here, and only here.

## What it contains

- **`extensions/issue-sync/`** keeps a feature's artifacts on GitHub: spec and plan as
  comments of its issue, tasks in the description of its PR (their completed
  Convergence phases in a comment of the PR once the description is full). Before each step, it copies
  them into a local cache ignored by git; afterwards, it sends them back. Its script is
  tested (`test/`), and these tests run with the repository's `test` script.
- **`presets/polly/`** adapts Spec Kit's commands and templates to the repository's
  rules: numbered cases and refusals in the spec, test strategy and review level in the
  plan, tasks that write their tests before their code, `converge` through code and test
  review up to human validation.

## What is generated from it

Reinstalling copies these sources under `.specify/` (`extensions/issue-sync/`,
`presets/polly/`) and produces the `.claude/skills/speckit-*` skills from them. These
copies are versioned so that a clone has nothing to install, but they are not edited by
hand: the next reinstall would overwrite the change, and the source would stay wrong.

## Changing it

1. Change the source here.
2. Reinstall, at the Spec Kit version recorded in `.specify/init-options.json`:

   ```sh
   uvx --from specify-cli==<version> specify extension add --dev ./speckit/extensions/issue-sync --force
   uvx --from specify-cli==<version> specify preset update polly --dev ./speckit/presets/polly
   ```

3. Run `nr lint:fix`: reinstalling rewrites `.claude/settings.json` in a format Biome
   rejects.
4. Commit the source together with everything the reinstall regenerated.
