# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React, built into static files that the analyzer (Rust) serves from its `watch` mode,
reading its graph from `/graph.json` and its updates from `/events` (server-sent
events). The same build also renders a static page from a saved snapshot. Desktop
browsers only.

## Users

Developers of a TypeScript repository whose architecture is written down as rules, and
the people who supervise AI coding agents working in it:

- **Watching an agent live**: the view stays open beside an agent coding in a worktree,
  updated on every saved file; the developer notices the moment an import crosses a
  forbidden boundary.
- **Reviewing a branch**: before merging, the developer reads what the branch adds and
  removes in the dependencies against its base, and its violations.
- **Understanding a repository**: someone new to it reads who depends on whom, and why
  each tier exists, from the rules' own criteria.

The tool is public: the view explains itself to someone who has never seen the
repository it shows.

## Product Purpose

Checks a repository's architecture against one rules file and shows it. The rules file
sorts every directory into a tier (a criterion, the tiers it may import, the
technologies it may use, the fix for a breach) and every package into its capacity. The
analyzer parses the sources, resolves each import, and reports every breach with its
file, line, rule and fix. The view makes the same analysis readable at a glance.
Success: a breach is seen when it happens, not at review time, and the architecture can
be read without reading the code.

## Positioning

The rules are data, in one file, which both the check and the view read: the view never
draws an architecture the check does not enforce. It runs live on a working tree, with
no idle cost, rather than as a report after the fact.

## Operating Context

- Started per worktree by the repository's development command, at its own local URL;
  several worktrees may run their views at once.
- The check runs in lint and CI; its text output (file, line, rule, fix) is what agents
  and CI read. The view is for humans.
- A branch is compared with its base, so a reviewer sees only what changed.

## Capabilities and Constraints

- The dependency matrix: modules in rows import modules in columns, both in tier order,
  so an allowed import lands on one side of the diagonal; each cell shows the rule for
  its pair and the imports behind it.
- Each module name carries its tier, with one color per tier everywhere.
- A pair's detail: its tiers, the verdict in one word before its explanation, the
  imports behind it.
- Violations grouped by rule, each openable at its file and line, with the rule and its
  fix.
- What the branch adds and removes against its base.
- Imports nothing from the repository it analyzes: only the rules file is specific to a
  repository. The name "architecture" is provisional.
- Interface in English.

## Brand Commitments

None yet: the tool has no name of its own.

## Evidence on Hand

The analyzer's real JSON output for the Polly repository (`architecture json`), and its
rules file `architecture.rules.json`. No screenshots, users or testimonials exist.

## Product Principles

1. The view shows what the check enforces, never a picture the rules do not hold.
2. A breach is visible at once, with where it is and how to fix it.
3. Read before decorate: the matrix stays legible at the size of a real repository.
4. What changed outranks what was always there.
