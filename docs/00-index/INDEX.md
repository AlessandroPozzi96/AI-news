# Index de la documentation et du code

Carte rapide : où se trouve chaque fonctionnalité ou concept. À jour avec le code du 2026-11-07.

## Documentation

| Document | Contenu |
|---|---|
| `specs-fonctionnelles.md` | Ce que fait la newsletter (F1 e-mail, F2 pages, F3 admin, F4 génération) |
| `specs-non-fonctionnelles.md` | Contraintes (sécurité, coût, qualité) |
| `infrastructure.md` | Choix techniques (I1 à I12), secrets, pipeline, architecture |
| `plan-implementation.md` | Phases 0 à 7 et leur état |
| `adr/` | Décisions d'architecture datées (ADR-0001 garde-fous de pertinence, ADR-0002 « Envoyer maintenant ») |

## Code

| Concept | Fichiers |
|---|---|
| Point d'entrée du Worker (routes web, désinscription, admin) | `src/index.ts`, `src/env.ts` |
| Identifiants de numéros (`AAAA-Sxx`, suffixe manuel `-2`…), semaine ISO | `src/issues/week.ts` |
| Lecture et écriture des numéros et de leurs éléments en D1 ; prochain identifiant manuel | `src/issues/store.ts` |
| Pipeline : envoi automatique (`runIfDue`, `runPipeline`), envoi manuel (`runNow`), reprise, alertes | `src/pipeline/run.ts` |
| Fenêtre d'envoi (jour, heure, fuseau, fréquence) | `src/pipeline/schedule.ts`, `src/pipeline/settings.ts` |
| Nombre d'éléments par section (défaut, bornes, lecture, formulaire) | `src/generate/types.ts`, `src/pipeline/settings.ts`, `src/admin/settings.ts`, `src/web/admin-pages.tsx` |
| Point d'entrée du pipeline (cron horaire et `--force`) | `scripts/pipeline.ts`, `.github/workflows/newsletter.yml` |
| Collecte des sources (GitHub, Hacker News, RSS, Reddit) | `src/collect/*` |
| Tri et rédaction par LLM, garde-fous de pertinence | `src/generate/*`, `src/llm/*` |
| Envoi des e-mails (Resend), jetons de désinscription | `src/mail/*` |
| Rendu des e-mails | `src/render/*` |
| Pages publiques `/issue/...`, mise en page | `src/web/routes.ts`, `src/web/pages.tsx`, `src/i18n.ts` |
| Désinscription | `src/web/unsubscribe.ts` |
| Dashboard admin : connexion, réglages, destinataires, historique | `src/web/admin.ts`, `src/web/admin-pages.tsx`, `src/admin/settings.ts`, `src/admin/session.ts` |
| « Envoyer maintenant » : déclenchement du workflow GitHub | `src/admin/dispatch.ts`, route `POST /admin/send-now` dans `src/web/admin.ts` |
| Accès D1 depuis le pipeline (API REST) | `src/db/rest-d1.ts` |
| Schéma D1 | `migrations/*.sql` |
| Tests | `test/*.spec.ts` (Vitest, pool Workers) |

## Commandes

| Action | Commande |
|---|---|
| Vérifier les types | `npm run typecheck` |
| Tests | `npm test` |
| Lint | `npm run lint` |
| Lancer le Worker en local | `npm run dev` |
| Pipeline local (ne pas utiliser sans raison : coûte de l'argent) | `npm run pipeline` |
