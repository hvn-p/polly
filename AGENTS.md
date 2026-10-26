# polly

Application web d'apprentissage des langues dont le professeur est l'agent IA de
l'apprenant, branché par le MCP.

## Lire avant d'agir

- **La constitution** (`.specify/memory/constitution.md`) porte les principes qu'un agent
  respecte quand il spécifie, planifie, écrit ou juge du code, chacun avec sa
  vérification. La lire avant de concevoir ou de juger un changement.
- **La direction du produit** et ses principes pédagogiques sont dans `PRODUCT.md`. Une
  interface se compose avec la skill Impeccable, qui le lit.

## Où s'écrit une décision

Chaque chose a un endroit et un seul : deux fichiers qui disent la même chose finissent
par se contredire, et c'est le périmé qu'on croit.

| Ce qui vient d'être décidé | Où ça s'écrit |
|---|---|
| Un principe qu'un agent respecte en écrivant ou en jugeant du code | La constitution |
| La direction du produit, un principe pédagogique | `PRODUCT.md` |
| Une règle de code propre à une partie du dépôt | L'`AGENTS.md` le plus proche de ce qu'elle gouverne |
| Ce qu'une fonctionnalité doit faire : spec, plan | Son issue, un commentaire par artefact Spec Kit |
| Comment elle se fait : les tâches | La description de sa PR |
| Le récit : ce qui a été mesuré, écarté, ce qui a causé quoi | L'issue |

Ces fichiers décrivent l'état actuel, au présent : ni date ni numéro d'issue en guise
d'histoire, ni inventaire de ce qui existe. Une décision qui en corrige une autre la
remplace. Un renvoi vers une issue ouverte reste légitime.

## Issues et cycle d'une fonctionnalité

Toute intention se trace en issue GitHub, même quand personne ne l'attaque tout de suite.
Avant de travailler un sujet, chercher ses précédents, ouverts comme fermés
(`gh issue list --state all --search …`).

Une fonctionnalité suit le cycle Spec Kit adapté au dépôt : `/speckit-specify`,
`/speckit-plan`, `/speckit-tasks`, `/speckit-implement`, `/speckit-converge`. Une idée
encore floue passe d'abord par `/speckit-assess-intake`. Un bug passe par
`/speckit-bug-assess` puis `/speckit-bug-fix`. La branche se nomme
`<numéro de l'issue>-<slug>`, et sa PR close l'issue.

**Lire une fonctionnalité** :

- le corps de l'issue porte l'intention ;
- un commentaire de l'issue qui commence par `<!-- speckit-artifact: … -->` est un
  artefact (spec, plan…), et fait foi : le cache local, ignoré par git, n'en est qu'une
  copie reconstruite à chaque étape ;
- les tâches sont dans la description de la PR, entre les marqueurs `speckit-tasks` ;
- les commentaires se lisent dans l'ordre : quand deux décisions se contredisent, la plus
  récente l'emporte.

**Accord d'écriture** : les commandes Spec Kit écrivent dans l'issue et la PR de la
fonctionnalité en cours, par l'extension `issue-sync`, et ouvrent cette PR en brouillon,
sans demander. L'accord ne couvre que ces deux-là et ce canal : toute autre issue ou PR
se demande.

## Stack

- **Front React et API Hono 4 séparés**, dans un monorepo pnpm. L'API est aussi le
  serveur d'autorisation OAuth du MCP, par Better Auth (plugins `mcp` et `cimd`), dont le
  code de polly ne passe que par les points d'extension.
- **TypeScript 7 seul**, compilé par `tsc`.
- **Biome** pour le lint et le format.
- **Frontières** : schémas Zod, contrat OpenAPI généré depuis eux, client généré par
  lequel passent le front et le MCP. Un refus qui dépend de l'état revient en code
  d'erreur nommé.
- **Postgres** : l'instance partagée du socle pikmine, jointe uniquement par
  `DATABASE_URL`.
- **L'analyse audio** est un service Python séparé, sur CPU. Aucune analyse ne se fait
  dans une requête HTTP : l'API répond aussitôt et le résultat arrive par le flux
  d'événements.

## Flux de travail

- Tout passe par une PR ; pas de commit direct sur `main`.
- Lancer `nr lint` sans pipe avant de committer : `| tail` masque son code de sortie.
- Après une trouvaille qui pourrait revenir au-delà du travail en cours (une revue, une
  validation, un retour humain), se demander ce qui l'aurait évitée : un contrôle
  d'abord, sinon une règle dans l'`AGENTS.md` le plus proche, sinon rien.
- Quand un changement retire la cause d'une telle règle (un contrôle la couvre, le code a
  changé), la mettre à jour ou la retirer.
