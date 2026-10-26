# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Separate React front end and Hono API, in TypeScript, in a pnpm monorepo; Postgres;
Better Auth for accounts and the MCP's OAuth server; a separate Python service for
audio analysis. Hosted as SaaS. The details and the code rules
are in `AGENTS.md`.

## Users

Anyone who wants to learn a language with their own AI, whatever their native language
and target language, and who wants learning tailored to their goals rather than a
common curriculum. They open Polly on a computer for a guided session, written as well
as spoken, and on a phone to check where they stand.

## Product Purpose

A language course whose teacher is the learner's AI agent. The agent composes the
exercises, reads the answers, judges and decides what comes next. Polly runs the
classroom: the screen where everything happens, the memory of what the learner knows
and what they get wrong, the review schedule, and the analysis of their
pronunciation. Polly succeeds when the learner comes back effortlessly, and when what
they learned one week is still there the next.

## Positioning

Polly does not supply an AI: the learner brings their own, and Polly gives it the
classroom and the memory that an agent alone does not keep from one session to the
next.

## Operating Context

- A session starts from a sentence said to the agent ("start my lesson"). Claude Code
  is the first supported AI client. The agent opens Polly in the browser; from then on everything happens on screen,
  with the agent staying in the background and reacting to what the learner does.
- Without a connected agent, on a phone as on a computer, Polly can only be consulted:
  progress, history, errors, results. Practising, lesson or review alike, requires
  a connected agent.
- A spoken recording is analysed by Polly as a background task, in a few seconds to
  half a minute; the agent reads the result and draws its own judgement from it.

## Capabilities and Constraints

- Any language can be learned, from any native language: nothing in the product
  assumes a language pair.
- Interface in English and French.
- Varied exercise types: comprehension, written and spoken expression, conversation,
  pronunciation.
- Decided outside the product: the agent composes and judges; Polly holds the review
  scheduling, the learner model, the log of their errors and the pronunciation
  assessment.
- Ideas kept, not decided: never make the learner wait during an analysis (move on to
  another exercise, or a test of several exercises whose result arrives at the end);
  two-pass grading, Polly's detailed analysis then the agent's judgement.

## Brand Commitments

The name `Polly`, the parrot of English and the start of "polyglot".

## Product Principles

1. The learner chooses nothing and types nothing to begin: the session is composed
   from their goals, what they know and what they get wrong.
2. Polly tracks knowledge, not exercises: a word, a phrase, a rule, a recurring
   error, a sound. Several exercises advance the same piece of knowledge, and the
   repetition goes unnoticed.
3. Every exercise makes the learner recall rather than reread, and every review
   comes before forgetting.
4. An error is first corrected by the learner; what gets confused is practised
   together.
5. Speaking counts as much as writing: communication tasks drawn from the learner's
   goals, and pronunciation trained by the ear before the mouth.
