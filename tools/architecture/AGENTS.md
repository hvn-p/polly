# Architecture analyzer and view

- `nr dev:up` serves the view from the pinned `@hvn-p/architecture`, never from these
  sources. After changing the analyzer or the view, run `nr dev:architecture source`
  to serve them from this worktree, and run it again after each change.
