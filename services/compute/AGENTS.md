# Polly's compute service

- A change here reaches a worktree's worker only through a new image: after editing, run
  `nr dev:worker real`, which starts a service built for the new fingerprint. A worker
  calling another version warns `COMPUTE_VERSION_MISMATCH` in its log.
- The service's OpenAPI is its contract: after changing an operation, run
  `nr contracts` to regenerate `@polly/analysis`'s client.
