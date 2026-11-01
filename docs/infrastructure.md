# Infrastructure et architecture

Statut : décisions validées en discussion (aucun code écrit à ce jour).

## Contraintes

- Aucun serveur personnel, PC non allumé en permanence.
- Facturation à l'usage ou gratuit, coût cible proche de 0 €/mois.
- Pas de nom de domaine pour l'instant.

## Décisions

| # | Décision | Raison |
|---|----------|--------|
| I1 | Hébergement tout-en-un sur **Cloudflare** (Workers, Cron Triggers, D1, Workflows) | Gratuit/à l'usage, un seul fournisseur, vraie base de données |
| I2 | Base de données : **Cloudflare D1** (SQLite managé) | Abonnés, configuration, numéros, éléments |
| I3 | Envoi d'e-mails : **Resend** (API d'envoi, une requête par destinataire) | Simple, palier gratuit |
| I4 | Génération de contenu : **API Anthropic**, derrière une interface LLM interchangeable | Qualité de rédaction ; alternatives gratuites possibles (Gemini, Workers AI) |
| I5 | Front : **un seul Worker TypeScript avec Hono**, HTML rendu côté serveur (JSX), HTMX pour l'admin, pas de framework JS lourd | Un projet, un déploiement, pas de build front à maintenir |
| I6 | E-mail : template HTML écrit à la main, styles en ligne | Compatibilité Gmail/Outlook |
| I7 | Déclenchement : cron **toutes les heures** ; le Worker vérifie dans la config s'il est l'heure d'envoi (fuseau Europe/Paris) et si le numéro n'est pas déjà parti | Heure/jour modifiables sans toucher au cron ; gère heure d'été/hiver |
| I8 | Pipeline exécuté dans **Cloudflare Workflows** (étapes avec retry) ; repli : enchaînement dans un seul Worker si indisponible en gratuit | Fiabilité |
| I9 | Admin protégé par **Cloudflare Access** (connexion par code à usage unique envoyé par e-mail, liste d'autorisés) ; à vérifier sur l'URL `workers.dev` | Aucun code d'authentification maison |
| I10 | Pages de détails publiques, non indexées (`noindex`) | Liens persistants depuis les e-mails |
| I11 | Déploiement **manuel** (`wrangler deploy`) depuis le PC au début ; GitHub Actions éventuellement plus tard | Simplicité |

## Pipeline hebdomadaire

Déclenché le vendredi à 18:00 (Europe/Paris) par défaut ; l'envoi part quelques minutes après, le temps de la génération.

1. **Collecte** (déterministe, sans LLM, sur les 7 derniers jours) à partir des sources ci-dessous.
2. **Tri** : modèle économique (Haiku) reçoit 50 à 80 candidats et renvoie en JSON score, catégorie et doublons. Règle de focus : au moins 2 éléments sur 5 concernent Claude Code, s'il y en a.
3. **Rédaction** : modèle de qualité (Sonnet) ; le Worker récupère le contenu complet de chaque source retenue, le modèle produit titre accrocheur, résumé de 2 phrases et page de détails dans la langue configurée.
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
- URLs déjà publiées stockées (`seen_urls`) : jamais de republication.
- Coût estimé : environ 1 $/mois (à confirmer sur les tarifs actuels).

## Données (D1)

`settings`, `subscribers`, `issues`, `items`, `seen_urls`, `runs` (journaux d'exécution).

## Points techniques à valider à l'implémentation

- **Domaine** : sans domaine vérifié (SPF/DKIM), Resend n'envoie qu'à l'adresse du propriétaire du compte. Pour ajouter des destinataires : acheter un domaine (~10 €/an, possible chez Cloudflare) et le vérifier chez Resend.
- **Cloudflare Access** sur l'URL `workers.dev` : à vérifier ; repli sur un mécanisme simple (lien magique ou secret).
- **Workflows** sur le plan gratuit : à vérifier.
- **Clé API** : l'abonnement Claude Pro ne donne pas accès à l'API ; clé facturée à l'usage à créer sur console.anthropic.com, stockée dans les secrets Cloudflare.

## Alternative écartée

GitHub Actions (cron) + GitHub Pages : gratuit, mais pas de backend pour le dashboard et la gestion des destinataires.
