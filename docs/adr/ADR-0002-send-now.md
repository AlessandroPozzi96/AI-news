# ADR-0002 — « Envoyer maintenant »

Statut : accepté (2026-11-07)

## Contexte
Le propriétaire veut pouvoir envoyer un numéro immédiatement depuis `/admin`, sans attendre le vendredi 18:00 et sans limite de nombre. Le Worker ne peut pas générer (10 ms de CPU, aucune clé Anthropic ou Resend) : la génération et l'envoi restent dans le pipeline GitHub Actions.

## Décision
| Sujet | Choix |
|---|---|
| Déclenchement | Le Worker appelle `workflow_dispatch` sur `newsletter.yml` avec `force: true` (branche `master`). `scripts/pipeline.ts --force` appelle `runNow` |
| Identifiant | Automatique : `2026-S45`. Manuel : suffixe à partir de 2 (`2026-S45-2`, `-3`…), même sans numéro automatique cette semaine. Pas de migration |
| Reprise | Si le dernier numéro manuel de la semaine n'est pas `sent` (échec), il est repris sans régénérer et sans renvoyer aux destinataires déjà servis |
| Taille minimale | 1 élément pour un envoi manuel (0 = échec et alerte). 3 éléments restent exigés pour l'envoi automatique |
| Indépendance | Le numéro automatique ignore les numéros manuels, y compris dans la requête « dernier envoi » (fréquence). Un envoi manuel le mercredi ne bloque pas l'envoi automatique du vendredi |
| Confirmation | Aucune (décision du propriétaire) |
| Jeton GitHub | Secret Worker `GH_DISPATCH_TOKEN` distinct, fine-grained, limité à ce dépôt, permission Actions en lecture et écriture. Le dépôt est une variable (`GITHUB_REPO`) |
| Erreurs | Tout code HTTP non 2xx lève une erreur sans le jeton ni le corps de la réponse. L'interface affiche « GitHub a refusé » |

## Conséquences
- Un envoi manuel passe par la file d'attente de GitHub Actions : quelques minutes de délai, et le workflow partage le verrou `concurrency: newsletter` avec le cron horaire.
- Les numéros manuels sont publics par lien comme les automatiques (`/issue/2026-S45-2`) et apparaissent dans l'historique.
- Un envoi manuel n'est pas soumis à la fréquence configurée : c'est voulu, mais le propriétaire doit savoir qu'il peut envoyer plusieurs fois par semaine.
- Un jeton GitHub compromis ne permet que de lancer ce workflow sur ce dépôt.
- Un échec de génération manuel alerte l'administrateur comme un échec automatique (même mécanisme).
