# Infrastructure et architecture

Statut : phases 1 à 4 réalisées ; phase 5 en cours. Révision du 2026-11-01 : le pipeline tourne sur GitHub Actions (voir « Changement d'architecture »).

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
| I9 | Admin protégé par **Cloudflare Access** (connexion par code à usage unique envoyé par e-mail, liste d'autorisés) ; à vérifier sur l'URL `workers.dev` | Aucun code d'authentification maison |
| I10 | Pages de détails publiques, non indexées (`noindex`) | Liens persistants depuis les e-mails |
| I11 | Déploiement du Worker **manuel** (`wrangler deploy`) depuis le PC. Les secrets du pipeline sont des secrets GitHub ; ceux du Worker des secrets Cloudflare (`UNSUBSCRIBE_SECRET` identique des deux côtés) | Simplicité |

## Pipeline hebdomadaire

Déclenché le vendredi à 18:00 (Europe/Paris) par défaut ; l'envoi part quelques minutes après, le temps de la génération.

1. **Collecte** (déterministe, sans LLM, sur les 7 derniers jours) à partir des sources ci-dessous.
2. **Tri** : modèle économique (Haiku) reçoit 50 à 80 candidats et renvoie en JSON score, catégorie et doublons. Règle de focus : au moins 2 éléments sur 5 concernent Claude Code, s'il y en a.
3. **Rédaction** : modèle de qualité (Sonnet) ; le script récupère le contenu complet de chaque source retenue, le modèle produit titre accrocheur, résumé de 2 phrases et page de détails dans la langue configurée.
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

Liste en configuration, extensible sans toucher à la logique. Risque : Reddit peut bloquer les IP Cloudflare ; dans ce cas retirer la source ou passer par un proxy.

## Génération : garde-fous

- Contenu web passé comme donnée délimitée, sans outils pour le modèle d'écriture, avec consigne anti-injection.
- HTML produit assaini avant affichage.
- URLs déjà publiées stockées (`seen_urls`) : jamais de republication. Toutes les sources d'un même sujet (retenue et alternatives) sont marquées vues.
- Pertinence (voir `adr/ADR-0001-relevance-guardrails.md`) : le tri attribue un `story` (identifiant kebab-case du sujet) ; un seul élément par `story`, les autres sources servent de repli si la source retenue est trop courte (< 400 caractères). Score minimal 5/10 : mieux vaut un numéro plus court que du remplissage ; moins de 3 éléments (ou moins que la taille configurée si elle est inférieure) = échec et alerte, rien n'est envoyé.
- Source trop courte pour un élément Hacker News : le fil de discussion (15 commentaires max) complète la page, signalé au rédacteur comme non vérifié. Les commandes ne sont jamais validées contre les commentaires, seulement contre la page. Les requêtes HTTP (`GET /v1/...`) ne sont pas des commandes.
- Coût estimé : environ 1 $/mois (à confirmer sur les tarifs actuels).

## Données (D1)

`settings`, `subscribers`, `issues` (statuts `draft` → `sending` → `sent`), `items`, `seen_urls`, `deliveries` (un enregistrement par numéro et destinataire, pour ne jamais envoyer deux fois), `runs` (journaux d'exécution et coût LLM).

## Points techniques à valider à l'implémentation

- **Domaine** : sans domaine vérifié (SPF/DKIM), Resend n'envoie qu'à l'adresse du propriétaire du compte. Pour ajouter des destinataires : acheter un domaine (~10 €/an, possible chez Cloudflare) et le vérifier chez Resend.
- **Cloudflare Access** sur l'URL `workers.dev` : à vérifier ; repli sur un mécanisme simple (lien magique ou secret).
- **Actions** : sur un dépôt privé, 2 000 min/mois gratuites ; le déclenchement horaire en consomme environ 700. Sur un dépôt public, les workflows planifiés sont désactivés après 60 jours sans activité du dépôt.
- **CPU du Worker web** : 10 ms par requête en gratuit. Les pages sont légères (rendu JSX + une lecture D1) ; si Cloudflare renvoie l'erreur 1102, mettre les pages en cache (Cache API).
- **Clé API** : l'abonnement Claude Pro ne donne pas accès à l'API ; clé facturée à l'usage à créer sur console.anthropic.com, stockée dans les secrets Cloudflare.

## Changement d'architecture (phase 5)

Cloudflare Workers (plan gratuit) : 10 ms de CPU par exécution et 50 requêtes sortantes. La collecte seule consomme environ 1,1 s de CPU (mesure locale) : impossible en gratuit. Options étudiées : Workers Paid à 5 $/mois (simple, horaire exact) ou pipeline sur GitHub Actions. **Choix : GitHub Actions**, pour rester à coût nul tant que l'utilité du service n'est pas confirmée. Migration vers Workers Paid possible plus tard : la logique est dans `runIfDue()`, il suffirait de rebrancher un handler `scheduled`.

Répartition :
- **Cloudflare Worker** : pages publiques, désinscription, futur dashboard admin. Aucune clé de génération ni d'envoi.
- **GitHub Actions** : collecte, génération, envoi. Accède à D1 par l'API REST (jeton Cloudflare limité à D1).
- **« Envoyer maintenant »** (phase 6) : déclenchement manuel du workflow (`workflow_dispatch`) ou drapeau en base lu par le prochain passage horaire.
