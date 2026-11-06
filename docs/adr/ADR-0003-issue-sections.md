# ADR-0003 — Structure du numéro en sections

Statut : accepté (2026-11-07)

## Contexte
Le numéro mélangeait des actualités datées et une règle de quota Claude Code (40 à 80 %) appliquée en code, sur une seule sélection. Une semaine calme produisait un numéro de news, sans contenu durable. Les sources ne couvraient que les 7 derniers jours : aucun outil ou tutoriel intemporel ne pouvait entrer.

## Décision
| Sujet | Choix |
|---|---|
| Structure | 7 éléments fixes, dans l'ordre : 3 `news` (1-3), 2 `must_have` (4-5), 2 `claude_code` (6-7). Les effectifs sont dans une seule constante (`SECTION_COUNTS`). |
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
