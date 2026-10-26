# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Front React et API Hono séparés, en TypeScript, dans un monorepo pnpm ; Postgres ;
Better Auth pour les comptes et le serveur OAuth du MCP ; un service Python séparé pour
l'analyse audio. Hébergé en SaaS. Le détail et les règles de code
sont dans `AGENTS.md`.

## Users

Toute personne qui veut apprendre une langue avec sa propre IA, quelle que soit sa langue
maternelle et la langue visée, et qui veut un apprentissage taillé pour ses objectifs
plutôt qu'un programme commun. Elle ouvre Polly sur ordinateur pour une séance guidée, à
l'écrit comme à l'oral, et sur téléphone pour consulter où elle en est.

## Product Purpose

Un cours de langue dont le professeur est l'agent IA de l'apprenant. L'agent compose les
exercices, lit les réponses, juge et décide de la suite. Polly tient la salle de classe :
l'écran où tout se passe, la mémoire de ce que l'apprenant sait et de ce qu'il rate, le
calendrier des révisions, et l'analyse de sa prononciation. Polly réussit quand
l'apprenant revient sans effort, et quand ce qu'il a appris une semaine est encore là la
suivante.

## Positioning

Polly ne fournit pas d'IA : l'apprenant amène la sienne, et Polly lui donne la salle de
classe et la mémoire qu'un agent seul n'a pas d'une séance à l'autre.

## Operating Context

- Une séance démarre d'une phrase dite à l'agent (« lance-moi le cours »). Claude Code
  est le premier client IA pris en charge. L'agent ouvre Polly dans le navigateur ; dès lors tout se passe à l'écran,
  l'agent restant en fond et réagissant à ce que fait l'apprenant.
- Sans agent connecté, sur téléphone comme sur ordinateur, Polly se consulte seulement :
  progression, historique, erreurs, résultats. S'exercer, cours comme révision, demande
  un agent connecté.
- Un enregistrement oral est analysé par Polly en tâche de fond, en quelques secondes à
  une demi-minute ; l'agent lit le résultat et en tire son propre jugement.

## Capabilities and Constraints

- N'importe quelle langue peut être apprise, depuis n'importe quelle langue maternelle :
  rien dans le produit ne suppose une paire de langues.
- Interface en anglais et en français.
- Types d'exercices variés : compréhension, expression écrite et orale, conversation,
  prononciation.
- Décidé ailleurs que dans le produit : l'agent compose et juge ; Polly détient la
  planification des révisions, le modèle de l'apprenant, le journal de ses erreurs et
  l'évaluation de la prononciation.
- Pistes retenues, non décidées : ne jamais faire attendre pendant une analyse (enchaîner
  un autre exercice, ou un contrôle de plusieurs exercices dont le résultat arrive à la
  fin) ; une correction en deux passes, l'analyse détaillée de Polly puis le jugement de
  l'agent.

## Brand Commitments

Le nom `Polly`, le perroquet de l'anglais et le début de « polyglot ».

## Product Principles

1. L'apprenant ne choisit rien et ne saisit rien pour commencer : la séance se compose à
   partir de ses objectifs, de ce qu'il sait et de ce qu'il rate.
2. Polly suit des connaissances, pas des exercices : un mot, une tournure, une règle, une
   erreur récurrente, un son. Plusieurs exercices font progresser la même connaissance,
   et la répétition passe inaperçue.
3. Chaque exercice fait rappeler plutôt que relire, et chaque révision tombe avant
   l'oubli.
4. Une erreur se fait d'abord corriger par l'apprenant ; ce qui se confond se travaille
   ensemble.
5. Parler compte autant qu'écrire : des tâches de communication tirées des objectifs de
   l'apprenant, et une prononciation travaillée par l'oreille avant la bouche.
