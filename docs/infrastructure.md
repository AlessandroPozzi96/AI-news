# Infrastructure et architecture

Statut : phases 1 à 5 réalisées ; phase 6 en cours. Révision du 2026-11-07 : le pipeline tourne sur GitHub Actions (voir « Changement d'architecture »), « Envoyer maintenant » déclenche le workflow (ADR-0002).

## Contraintes

- Aucun serveur personnel, PC non allumé en permanence.
- Facturation à l'usage ou gratuit, coût cible proche de 0 €/mois.
- Pas de nom de domaine pour l'instant.

## Décisions

| # | Décision | Raison |
|---|----------|--------|
| I1 | Côté web : **Cloudflare Workers + D1** (plan gratuit). Côté pipeline : **GitHub Actions** (gratuit) | Le plan gratuit de Cloudflare limite le CPU à 10 ms par exécution : insuffisant pour collecter et parser les flux |
| I2 | Base de données : **Cloudflare D1** (SQLite managé) | Abonnés, configuration, numéros, éléments |
| I3 | Envoi d'e-mails : **Resend** (API d'envoi, une requête par destinataire) | Simple, palier gratuit |
| I4 | Génération de contenu : **API Anthropic**, derrière une interface LLM interchangeable | Qualité de rédaction ; alternatives gratuites possibles (Gemini, Workers AI) |
| I5 | Front : **un seul Worker TypeScript avec Hono**, HTML rendu côté serveur (JSX), HTMX pour l'admin, pas de framework JS lourd | Un projet, un déploiement, pas de build front à maintenir |
| I6 | E-mail : template HTML écrit à la main, styles en ligne | Compatibilité Gmail/Outlook |
| I7 | Déclenchement : workflow GitHub Actions planifié **toutes les heures** ; le pipeline lit la config en D1 pour savoir s'il est l'heure d'envoi (fuseau Europe/Paris, rattrapage jusqu'à 48 h) et si le numéro n'est pas déjà parti | Heure/jour modifiables sans toucher au cron ; gère heure d'été/hiver. L'heure réelle d'envoi peut décaler de 10 à 30 min (retards habituels de GitHub) |
| I8 | Pipeline = un script Node (`scripts/pipeline.ts`) qui accède à D1 via l'API REST Cloudflare (adaptateur `src/db/rest-d1.ts`, même code et mêmes requêtes que le Worker). Idempotent, reprend après un échec partiel, s'arrête après 3 échecs automatiques | Fiabilité sans Workflows (payant en pratique) |
| I9 | Admin protégé par un **jeton** (`ADMIN_TOKEN`, secret Worker) échangé contre un **cookie de session signé** (HttpOnly, SameSite=Strict, 7 jours) ; contrôle d'`Origin` sur les POST. Sans jeton, `/admin` répond 404 | Pas de service externe à configurer, vérifiable sur `workers.dev` (Cloudflare Access écarté) |
| I10 | Pages de détails publiques, non indexées (`noindex`) | Liens persistants depuis les e-mails |
| I11 | Déploiement du Worker **manuel** (`wrangler deploy`) depuis le PC. Les secrets du pipeline sont des secrets GitHub ; ceux du Worker des secrets Cloudflare (`UNSUBSCRIBE_SECRET` identique des deux côtés) | Simplicité |
| I12 | « Envoyer maintenant » : le Worker appelle `workflow_dispatch` (`force`) ; il ne génère rien. Jeton GitHub séparé, à moindre privilège (voir « Secrets » ci-dessous) | Le Worker n'a ni clé Anthropic ni clé Resend, et 10 ms de CPU |

## Secrets

| Où | Nom | Rôle |
|---|---|---|
| Worker (`npx wrangler secret put …`) | `ADMIN_TOKEN` | Connexion au dashboard (≥ 16 caractères) |
| Worker | `GH_DISPATCH_TOKEN` | Jeton GitHub fine-grained, limité à ce dépôt, permission **Actions : lecture et écriture**. Sert uniquement à lancer le workflow |
| Worker | `UNSUBSCRIBE_SECRET` | Signature des liens de désinscription |
| `wrangler.jsonc` (variable, non secrète) | `GITHUB_REPO` | Dépôt dans lequel le workflow est lancé |
| GitHub Actions | `CF_*`, `D1_DATABASE_ID`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `UNSUBSCRIBE_SECRET`, `ADMIN_EMAIL` | Pipeline |

## Pipeline hebdomadaire

Déclenché le vendredi à 18:00 (Europe/Paris) par défaut ; l'envoi part quelques minutes après, le temps de la génération.

1. **Collecte** (déterministe, sans LLM) : sources datées (7 derniers jours) et sources non datées (catalogue, dépôts populaires, documentation), voir ci-dessous.
2. **Tri** : un appel Haiku par section (`claude_code`, puis `must_have`, puis `news`), avec ses critères ; chaque appel renvoie un score, une catégorie et un `story`. Une histoire déjà retenue dans une section n'est pas reprise dans les suivantes. Les candidats datés sont plafonnés (150, les plus récents) ; les non datés sont toujours tous envoyés.
3. **Rédaction** : modèle de qualité (Sonnet) ; le script récupère le contenu complet de chaque source retenue, le modèle produit titre, résumé d'une phrase et page de détails dans la langue configurée. Consigne propre à la section (un indispensable explique pourquoi et comment l'installer ; un élément Claude Code peut être un tutoriel).
4. **Enregistrement** du numéro (`AAAA-Sxx`) et de ses éléments en D1.
5. **Envoi** : un mail par destinataire via Resend, avec lien de désinscription signé. Chaque titre pointe vers `/issue/<semaine>/<item>`.

## Sources de collecte

| Source | Moyen | Sert à détecter |
|---|---|---|
| GitHub Releases : `anthropics/claude-code`, `claude-agent-sdk`, `anthropics/skills`, `modelcontextprotocol/*`, `openai/codex`, `google-gemini/gemini-cli` | API GitHub | Nouvelles versions, commandes, raccourcis |
| Changelog et docs Claude Code, blog Anthropic | Page ou RSS | Nouveaux modèles et fonctions |
| Blogs OpenAI, Google, Cursor, etc. | RSS | Sorties de modèles et d'outils concurrents |
| Hacker News | API Algolia (mots-clés + seuil de points) | Sujets tendance |
| Reddit : r/ClaudeAI, r/ClaudeCode | RSS | Bonnes pratiques, astuces |
| GitHub : dépôts récents avec topics `claude-code`, `mcp-server`, `agent-skills` | API Search, triés par étoiles | Skills et outils tendance |
| Blogs d'experts (Simon Willison, Latent Space) | RSS | Bonnes pratiques |
| Recherche web de l'API Claude (1 appel/semaine) | Outil `web_search` | Filet de sécurité |
| Catalogue manuel `src/collect/must-have.ts` (non daté) | Liste versionnée, éditée à la main ; première entrée Graphify | Outils et techniques « indispensables » (section `must_have`), prioritaires sur les dépôts populaires |
| GitHub : dépôts populaires, topics ci-dessus, triés par étoiles (≥ 500), actifs depuis 90 jours (`pushed`), sans filtre de création (non daté) | API Search | Outils intemporels |
| Documentation Claude Code, `https://code.claude.com/docs/llms.txt` (pages réglages et tutoriels, non datées) | Index llms.txt | Réserve de la section `claude_code` quand l'actualité est calme |

Les sources non datées portent `evergreen` : elles n'entrent jamais dans la section `news` et ne sont jamais tronquées. Une fois publiées, elles ne sont plus proposées (`seen_urls`).

Liste en configuration, extensible sans toucher à la logique. Risque : Reddit peut bloquer les IP Cloudflare ; dans ce cas retirer la source ou passer par un proxy.

## Génération : garde-fous

- Contenu web passé comme donnée délimitée, sans outils pour le modèle d'écriture, avec consigne anti-injection.
- HTML produit assaini avant affichage.
- URLs déjà publiées stockées (`seen_urls`) : jamais de republication. Toutes les sources d'un même sujet (retenue et alternatives) sont marquées vues.
- Pertinence (voir `adr/ADR-0001-relevance-guardrails.md`) : le tri attribue un `story` (identifiant kebab-case du sujet) ; un seul élément par `story`, les autres sources servent de repli si la source retenue est trop courte (< 400 caractères). Score minimal 5/10 (actualités seulement) : mieux vaut un numéro plus court que du remplissage ; moins de 3 éléments, ou aucun élément Claude Code = échec et alerte, rien n'est envoyé. Structure 3 / 2 / 2 : voir `adr/ADR-0003-issue-sections.md`.
- Source trop courte pour un élément Hacker News : le fil de discussion (15 commentaires max) complète la page, signalé au rédacteur comme non vérifié. Les commandes ne sont jamais validées contre les commentaires, seulement contre la page. Les requêtes HTTP (`GET /v1/...`) ne sont pas des commandes.
- Coût estimé : environ 1 $/mois (à confirmer sur les tarifs actuels).

## Données (D1)

`settings`, `subscribers`, `issues` (statuts `draft` → `sending` → `sent`), `items` (colonne `section`, vide pour les anciens numéros, migration `0004`), `seen_urls`, `deliveries` (un enregistrement par numéro et destinataire, pour ne jamais envoyer deux fois), `runs` (journaux d'exécution et coût LLM).

## Points techniques à valider à l'implémentation

- **Domaine** : sans domaine vérifié (SPF/DKIM), Resend n'envoie qu'à l'adresse du propriétaire du compte. Pour ajouter des destinataires : acheter un domaine (~10 €/an, possible chez Cloudflare) et le vérifier chez Resend.
- **Actions** : sur un dépôt privé, 2 000 min/mois gratuites ; le déclenchement horaire en consomme environ 700. Sur un dépôt public, les workflows planifiés sont désactivés après 60 jours sans activité du dépôt.
- **CPU du Worker web** : 10 ms par requête en gratuit. Les pages sont légères (rendu JSX + une lecture D1) ; si Cloudflare renvoie l'erreur 1102, mettre les pages en cache (Cache API).
- **Clé API** : l'abonnement Claude Pro ne donne pas accès à l'API ; clé facturée à l'usage à créer sur console.anthropic.com, stockée dans les secrets Cloudflare.

## Changement d'architecture (phase 5)

Cloudflare Workers (plan gratuit) : 10 ms de CPU par exécution et 50 requêtes sortantes. La collecte seule consomme environ 1,1 s de CPU (mesure locale) : impossible en gratuit. Options étudiées : Workers Paid à 5 $/mois (simple, horaire exact) ou pipeline sur GitHub Actions. **Choix : GitHub Actions**, pour rester à coût nul tant que l'utilité du service n'est pas confirmée. Migration vers Workers Paid possible plus tard : la logique est dans `runIfDue()`, il suffirait de rebrancher un handler `scheduled`.

Répartition :
- **Cloudflare Worker** : pages publiques, désinscription, futur dashboard admin. Aucune clé de génération ni d'envoi.
- **GitHub Actions** : collecte, génération, envoi. Accède à D1 par l'API REST (jeton Cloudflare limité à D1).
- **« Envoyer maintenant »** (phase 6, réalisé) : le bouton `/admin` appelle `workflow_dispatch` sur `newsletter.yml` (`force: true`, branche `master`). Le workflow lance `scripts/pipeline.ts --force`, qui génère et envoie un numéro manuel (`AAAA-Sxx-2`, `-3`…) à tous les abonnés actifs. Délai : le temps de file d'attente de GitHub Actions (quelques minutes). Détails : `adr/ADR-0002-send-now.md`.
