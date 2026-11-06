# Plan d'implémentation

Principe : traiter d'abord le risque principal (la qualité du contenu généré), puis l'automatisation, puis l'admin. Chaque phase se termine par un résultat vérifiable. Aucune phase ne démarre sans validation de la précédente.

## Phase 0 — Prérequis (à faire par toi)

- Compte Cloudflare (gratuit).
- Compte Resend et clé API (gratuit).
- Clé API Anthropic (console.anthropic.com, avec un plafond de dépense mensuel, par exemple 5 $).
- Node.js LTS installé ; connexion de `wrangler` à Cloudflare.

**Fait quand** : `wrangler whoami` affiche ton compte et les deux clés sont en ta possession.

## Phase 1 — Socle

- Projet TypeScript + Hono + Wrangler dans `C:\Projects\AI_News`, dépôt git.
- Schéma D1 et migrations (`settings`, `subscribers`, `issues`, `items`, `seen_urls`, `runs`).
- Tests (Vitest), lint, gestion des secrets Cloudflare.
- Déploiement d'une page « hello » sur l'URL `workers.dev`.

**Fait quand** : la page répond en ligne, les migrations sont appliquées, les tests passent.

## Phase 2 — Collecte

- Type commun `Candidate` (titre, URL, extrait, source, date, métriques).
- Un collecteur par famille de source : GitHub Releases, GitHub Search, Hacker News (Algolia), RSS/blogs, Reddit RSS, changelog Claude Code.
- Dédoublonnage par URL et contre `seen_urls`.
- Tolérance aux pannes : une source en échec n'arrête pas les autres.
- Tests sur des réponses enregistrées (fixtures).

**Fait quand** : une commande locale affiche les candidats des 7 derniers jours, depuis les vraies sources.

## Phase 3 — Génération (phase la plus risquée)

- Interface LLM interchangeable, implémentation Claude.
- Étape de tri (Haiku) avec sortie JSON validée, une passe par section (structure 3 / 2 / 2, voir `adr/ADR-0003-issue-sections.md`).
- Étape de rédaction (Sonnet) : titre, résumé, page de détails, en français ou en anglais.
- Garde-fous : contenu web en données délimitées, aucun outil pour le modèle d'écriture, assainissement du HTML.
- Mode **dry-run** : produit un numéro complet dans un fichier local, sans envoi ni écriture en production.
- Ajustement des prompts sur 2 à 3 numéros réels.

**Fait quand** : tu relis un numéro généré et le juges digne d'être envoyé (titres, pertinence, exactitude des liens et commandes).

**État** : garde-fous de pertinence ajoutés après le premier dry-run réel (voir `adr/ADR-0001-relevance-guardrails.md`) ; le dry-run du 2026-11-03 donne un numéro cohérent. Structure en sections 3 / 2 / 2 avec sources non datées (voir `adr/ADR-0003-issue-sections.md`) : à valider par un dry-run réel avant l'envoi. Reste ta relecture.

## Phase 4 — Pages publiques et template d'e-mail

- Route `/issue/<semaine>/<item>` rendue depuis D1, `noindex`, mise en cache.
- Template HTML de l'e-mail (styles en ligne), lien vers chaque page de détails.
- Prévisualisation locale du mail et des pages.

**Fait quand** : le numéro de la phase 3 s'affiche correctement dans un navigateur et dans un client mail de test (Gmail).

## Phase 5 — Envoi et automatisation

- Intégration Resend (un mail par destinataire), lien de désinscription signé et route `/unsubscribe`.
- Cron horaire + vérification jour/heure Europe/Paris + idempotence par numéro `AAAA-Sxx`.
- Pipeline dans Workflows (ou repli en un seul Worker), journal dans `runs`.
- Alerte par e-mail en cas d'échec.

**Fait quand** : un envoi de test réel arrive dans ta boîte, un second déclenchement du même numéro n'envoie rien, une panne simulée génère l'alerte.

**État** : réalisée (pipeline sur GitHub Actions, cron horaire, idempotence par destinataire, alerte admin). Voir `infrastructure.md`.

## Phase 6 — Dashboard admin

- Réglages : jour/heure, fréquence, langue (la structure du numéro est fixe, voir ADR-0003).
- Destinataires : ajout, suppression, activation.
- Actions : prévisualiser le prochain numéro, « envoyer maintenant », relancer un échec, historique.
- Protection : jeton `ADMIN_TOKEN` (secret Worker, ≥ 16 caractères) + cookie de session signé (HttpOnly, SameSite=Strict, 7 jours) + contrôle d'`Origin` sur les POST. Sans jeton, `/admin` répond 404. Choisi plutôt que Cloudflare Access (configuration manuelle dans le dashboard, non vérifiable sur `workers.dev`).

**État** : réglages, destinataires (ajout/désactivation/réactivation, pas de suppression : l'historique d'envoi y est lié), historique des numéros et exécutions, « Envoyer maintenant » (ADR-0002) codés et testés. Reste : prévisualisation du prochain numéro, puis déploiement avec les secrets `ADMIN_TOKEN` et `GH_DISPATCH_TOKEN`. La relance d'un échec est couverte par « Envoyer maintenant » (reprise sans régénérer ni renvoyer aux destinataires déjà servis).

**Fait quand** : tout se règle depuis le navigateur et `/admin` est inaccessible sans connexion.

## Phase 7 — Mise en production

- Revue sécurité (secrets, injection, XSS, accès admin).
- Premier envoi automatique réel un vendredi 18:00.
- Observation de 2 à 3 semaines : qualité, coût réel de l'API, ajustement des sources.

**Fait quand** : trois numéros consécutifs sont partis sans intervention.

## Plus tard (hors plan)

- Achat d'un domaine et vérification chez Resend pour ajouter d'autres destinataires.
- GitHub Actions pour le déploiement.
- Statistiques d'ouverture et de clic.

## Risques et parades

| Risque | Parade |
|---|---|
| Contenu généré inexact ou hors sujet | Phase 3 isolée avec dry-run et relecture humaine avant toute automatisation |
| Source bloquante (Reddit) | Collecteurs indépendants, retrait ou proxy |
| Cloudflare Access indisponible sur `workers.dev` | Repli : lien magique ou secret |
| Workflows indisponible en gratuit | Repli : pipeline dans un seul Worker |
| Dérive du coût API | Plafond mensuel côté Anthropic, suivi du coût par exécution dans `runs` |
| Mail en spam | Phase 1 : envoi à soi-même ; domaine vérifié avant d'ajouter des destinataires |
