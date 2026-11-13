# ADR-0003 — Structure du numéro en sections

Statut : accepté (2026-11-07)

## Contexte
Le numéro mélangeait des actualités datées et une règle de quota Claude Code (40 à 80 %) appliquée en code, sur une seule sélection. Une semaine calme produisait un numéro de news, sans contenu durable. Les sources ne couvraient que les 7 derniers jours : aucun outil ou tutoriel intemporel ne pouvait entrer.

## Décision
| Sujet | Choix |
|---|---|
| Structure | 7 éléments par défaut, dans l'ordre : 3 `news`, 2 `must_have`, 2 `claude_code`. Les effectifs par défaut sont dans une seule constante (`SECTION_COUNTS`) ; ils sont réglables depuis l'amendement du 2026-11-14 ci-dessous. |
| Sources non datées | Catalogue manuel (`src/collect/must-have.ts`), dépôts populaires triés par étoiles avec activité récente (`githubPopular`), pages de docs Claude Code (`src/collect/claude-docs.ts`). Marquées `evergreen`. |
| Pools | Un élément non daté n'entre jamais dans `news` et n'est jamais tronqué par `MAX_CANDIDATES`. Catalogue avant dépôts populaires ; documentation en réserve pour `claude_code`. |
| Tri | Un appel Haiku par section, avec ses propres critères. Ordre de sélection : `claude_code`, `must_have`, `news`. |
| Doublons | Une `story` n'apparaît qu'une fois sur tout le numéro ; une URL déjà rédigée (`seen_urls`) n'est jamais reprise, y compris les sources non datées. |
| Règle d'envoi | Au moins 3 éléments dont 1 `claude_code`. Sinon échec et alerte, comme avant. |
| Seuil de pertinence | `MIN_RELEVANCE_SCORE` ne s'applique qu'aux actualités. |
| Quota Claude Code et `selectPicks` | Supprimés. |

## Conséquences
- Un numéro est toujours complet (7 éléments) quand les sources le permettent ; une semaine calme s'appuie sur la documentation pour `claude_code`.
- Le catalogue est édité à la main : une entrée ajoutée n'est proposée qu'une fois, puis marquée vue.
- Les anciens numéros (sans section) s'affichent sans titres de section.
- Le réglage « articles par numéro » disparaît de l'admin ; la colonne `settings.items_per_issue` reste en base, sans effet.
- Coût : trois appels Haiku au lieu d'un, soit quelques centimes de plus par numéro.

## Amendement du 2026-11-14 — effectifs réglables
Les effectifs ne sont plus fixes : le dashboard admin permet de choisir le nombre d'éléments de chaque section.

| Sujet | Choix |
|---|---|
| Stockage | Trois clés de la table `settings` : `count_news`, `count_must_have`, `count_claude_code`. Pas de migration : une clé absente vaut le défaut. |
| Défaut | `SECTION_COUNTS` (3 / 2 / 2) reste la valeur par défaut, et celle de `npm run dry-run`. |
| Bornes | 1 à 5 par section (`SECTION_COUNT_RANGE`). Le minimum de 1 garde la règle d'envoi atteignable (3 éléments dont 1 `claude_code`) ; le maximum de 5 plafonne le coût de rédaction (un appel Sonnet par élément). |
| Valeur invalide en base | Ignorée au profit du défaut ; le formulaire refuse toute valeur hors bornes. |
| Section `claude_code` | Règle inchangée : un seul emplacement pour les nouveautés récentes, le reste d'abord depuis la documentation, puis à nouveau les nouveautés si la documentation ne suffit pas. |
