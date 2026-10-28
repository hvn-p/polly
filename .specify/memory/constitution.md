# Polly Constitution

The principles an agent follows when it specifies, plans, writes or reviews code in this
repository. Each one says how it is verified. A spec or plan that needs to break a principle
is wrong and gets corrected; a principle that no longer holds is changed here.

## Domain

### I. The server holds the memory, the AI composes

The learner's memory (what they know, their errors, their schedule, their results) lives on
the server. The AI picks an activity from the catalogue the server defines and writes its
content. It never invents a new form of exercise and keeps no learning state of its own.

Why: an AI session ends and forgets, and an exercise of free form cannot be scored, so it
leaves no trace in the learner's memory.

*Verified by*: the MCP tool schemas, which accept only activity types from the catalogue; a
test that runs a session, drops the agent, and resumes from the server alone; code review.

### II. Polly depends on no particular AI

Everything specific to one AI client lives in that client's adapter. The domain and the MCP
tools behave the same whatever client calls them.

Why: Polly is for everyone, and the first supported client will not be the last.

*Verified by*: the dependency check (the domain imports no client adapter); code review.

### III. Every score rests on evidence

A score comes from a deterministic measurement when one is possible, otherwise from an AI
judgment that cites what it observed. A score carries its evidence and its source
(measurement or judgment) in its type. A score without evidence does not exist.

Why: language models grade unreliably, and a learner's progress must be explainable.

*Verified by*: the score type, which cannot be built without evidence and source; the tests
of each evaluation; code review.

### IV. A language is data

The domain knows no particular language. A language arrives as a pack that declares what it
provides and what it can do; an activity that needs a missing capability is unavailable for
that language. Adding a language adds a pack and never changes the domain. The language
being learned, the learner's native language and the interface language are three distinct
notions.

Why: Polly targets any language, learned from any native language.

*Verified by*: a test that registers a fake language pack and runs a session with it; code
review, which refuses a condition on a given language outside its pack.

### V. The server is the source of truth for a session

Every event of a session (what is shown, each answer, each result) is recorded when it
happens, in an append-only log. The screen and the agent display the server's state, never
their own. An interrupted session resumes where it stopped, and events missed during a
disconnection are replayed from the log.

Why: the browser, the agent and the server can each fail, and the learner must not lose
their work.

*Verified by*: a test that cuts the connection mid-session and checks that every missed
event arrives once and in order; a test that rebuilds a session from its log alone.

## Architecture

### VI. Hexagonal architecture

Polly's code never talks to a technology directly. Every external component
(database, file storage, identity, logging, durable tasks, AI clients, the compute
service, the clock) sits behind a port: an interface declared by the code that
needs it, in that code's words, holding only the functions it calls. An adapter
implements one or more ports with one technology.

Adapters are grouped in one package per capacity, named by what it provides
(`database`, never `postgres`). Only a process's composition root imports them. An
adapter package may depend on a lower one, never in a cycle. An interface (web
front end, MCP server, monitor) reaches the back only through the API's generated
contract.

Why: every external piece can change, and the business code must stay testable
and readable without any of them.

*Verified by*: the dependency check (no technology library and no adapter package
outside the adapters and the composition roots, no cycle between adapter
packages); domain tests on in-memory adapters; code review.

### VII. Ordered tiers, each defined by a criterion

Code is arranged in ordered tiers, and dependencies only point down. A tier is
defined by what it may import and what it may do, never by a folder name: a module
belongs to the tier whose criterion its content meets. Modules on the same tier
never import each other: whatever needs two modules is composed in the tier above.
A module is entered only through its public entry point. The graph has no cycle.

Before building, the author names the tier an addition belongs to. When none fits,
the work stops: a trivial case is decided and written in the pull request with its
reason; any other case goes to a human with the options. Code is never forced into
a tier whose criterion it does not meet, and a dependency rule never gets an
exception to let it through.

Why: a graph between peers grows one reasonable-looking edge at a time until
everything calls everything; a tier defined by a folder rather than a criterion
fills with whatever was nearest.

*Verified by*: a dependency check in CI that reads its rules from one file at the
repository root, fails on any violation, names the fix in its message, and has a
test per rule that feeds it a deliberate violation; the same analysis drawn live as
the architecture view; a reason in the pull request for any change to that file;
code review, which refuses a module that does not meet its tier's criterion.

### VIII. DRY, with value objects

Every piece of knowledge has a single, unambiguous, authoritative representation: DRY in its
original sense, which is about knowledge, not text. Domain concepts are value objects,
defined once, validating themselves, and reused everywhere. Contracts between processes are
generated from a single schema, for every process whatever its language. Two pieces of code
that change for the same reason are one piece of knowledge and live in one place; code that
only looks alike and changes for different reasons stays separate. A variation is passed as
data, not as a flag that switches behaviour.

Why: a rule written twice drifts, and two screens end up doing the same thing differently.

*Verified by*: CI that regenerates the contracts and fails if they differ; code review,
which refuses a second definition of a known notion.

### IX. No heavy computation inside a request

A request answers fast. Long or heavy work runs as a durable background task, and its result
reaches the learner as an event. Every step of a task can run again without side effects,
since a step may run twice after a crash.

Why: a request that waits on heavy work blocks the learner and falls over under load.

*Verified by*: a test that kills a worker mid-task and checks for exactly one result; code
review of every route that triggers work.

### X. An established component rather than an in-house one

What the market already does well (authentication, durable tasks, storage, speech models) is
adopted, not rewritten. Choosing a component is recorded as an ADR, and an in-house
solution needs a written reason there.

A dependency lives in the project whenever it can, so that cloning the repository
is enough to work: the machine provides only what the project cannot carry (Node,
Docker). The root manifest declares only the tools of the whole project and the
dependencies common to every package; every other package declares what it
imports.

Why: Polly's value is in learning, not in solving problems that are already solved.

*Verified by*: an ADR for every component choice; the dependency check, which refuses an
import its package does not declare; code review.

## Fabrication

### XI. A strict language, configured to refuse

The project's own code is checked at the strictest setting of each language. No typing
workaround is allowed, and a lint warning is an error. Every piece of data entering from
outside is validated at the boundary against its schema.

Why: what the compiler refuses never reaches a review or a learner.

*Verified by*: one base configuration per language, which every package extends without
relaxing a strictness option; a CI check of those configurations; a reason required in the
pull request for any change to them.

### XII. Tests state the behaviour, and what passes today passes tomorrow

Tests are written first, in the same session as the code. Every behaviour, case and refusal
of a spec has a test that fails if it breaks, and a fixed bug leaves a test. A test is
isolated: no network call beyond the services it starts itself. Every pull request reaches
the coverage threshold set for the repository.

Why: tests are the only description of the behaviour that cannot go stale silently.

*Verified by*: the coverage gate in CI; outbound network blocked in tests; the test review
at the end of development.

### XIII. What a program can check, a program checks

A rule that can be enforced by a type, a lint, a script or a test is enforced that way, in
CI. Every guard has its own test, which feeds it a deliberate defect and requires it to
fail. A rule that stays in prose names the review that judges it.

Why: a rule in prose is applied unevenly; a check is applied every time.

*Verified by*: each guard's own test; code review, which refuses a new guard without one.

### XIV. An MCP tool is a full interface

The AI uses Polly through its MCP tools the way a person uses screens. Every tool is tested,
and its name and description are written and reviewed with the care of a screen. An AI
misuse in real use is an interface defect.

Why: the description is all the AI reads before it acts.

*Verified by*: a test that requires every MCP tool to be exercised; code review of tool
names and descriptions.

## Security and Data

### XV. No route without an access rule

Every route, web or MCP, declares its access rule from a closed, generic set, and access is
denied by default. A learner's data is visible and changeable by that learner only.

Why: an access rule left to each route is eventually forgotten on one of them.

*Verified by*: the type system, which cannot register a route without its rule; a test that
walks every route (anonymous refused on a protected route, a second learner refused on the
first one's data).

### XVI. Nothing entered is trustworthy

Everything comes from input, by a person or by an AI, so everything is hostile until proven
otherwise, AI output included. Every field exists for a reason, is bounded, and is validated
by the API, never only by the interface. Input is never assembled into a query, a command or
HTML. Learner text sent to an AI travels in a delimited data field that the tool description
marks as content, never as instructions.

Why: a learner's text reaches an AI, which makes prompt injection a real path.

*Verified by*: the contract (an unbounded text or number field fails CI); a test that sends
an injection text and checks it comes back delimited; a security review when a feature adds
a field.

### XVII. Nothing secret or personal where it does not belong

A log holds identifiers only: no learner text, no recording. A voice recording is personal
data, kept for a bounded period and then deleted automatically. No secret and no server
topology live in the repository. Dependencies and CI actions are pinned.

Why: a leaked log or repository must not expose a learner or the platform.

*Verified by*: a test that plays sessions and searches the logs for the text it entered;
secret scanning in CI; a check that refuses an unpinned CI action; a security review.

### XVIII. Everything is in English, except what the learner reads

Code, identifiers, comments, documentation, specs, issues, pull requests and commits are in
English. Only the product interface is translated, English and French at first, and its
texts live in message catalogues, never hard-coded in a component. What a learner typed
stays as they typed it.

Why: one working language for every contributor, human or AI, and any number of languages
for learners.

*Verified by*: catalogue tests (every language has exactly the keys of the reference
catalogue, no empty message); code review, which refuses a hard-coded displayed text.

## Governance

This constitution prevails over any spec, plan or practice that contradicts it. It changes
by pull request. Its version follows semantic versioning: MAJOR when a principle is removed
or redefined, MINOR when one is added or materially expanded, PATCH for wording. Every plan
checks the feature against each principle; code review judges the principles that no
program checks. Day-to-day guidance for agents lives in `AGENTS.md`.

**Version**: 2.0.0 | **Ratified**: 2026-10-26 | **Last Amended**: 2026-10-28
