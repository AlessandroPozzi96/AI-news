# ADR-0001 — Garde-fous de pertinence de la génération

Statut : accepté (2026-11-03)

## Contexte
Le premier dry-run réel a montré : doublons (même nouveauté via le CLI et le SDK), actualité de sécurité majeure écartée (source trop courte), libellé anglais, faux « commande » (endpoint d'API). La pertinence est le cœur du produit.

## Décision
| Sujet | Choix |
|---|---|
| Doublons | Le tri (Haiku) renvoie un `story` par élément ; le code garde le meilleur par `story`, les autres deviennent sources de repli. Un `story` mal formé désactive la fusion. |
| Sources trop courtes | Repli sur les sources alternatives du même sujet (2 max), puis fil Hacker News (non vérifié). |
| Pertinence | Score minimal 5/10, appliqué avant la fusion des sujets. Jamais de remplissage. |
| Taille minimale | 3 éléments (ou la taille configurée si < 3). En dessous : échec, alerte admin, rien n'est envoyé ni marqué comme vu. |
| Commandes | Copiées textuellement de la page uniquement (jamais des commentaires), requêtes HTTP exclues. |

## Conséquences
- Un numéro peut contenir moins de 5 éléments ; une semaine pauvre échoue plutôt que d'envoyer du remplissage.
- Un `story` trop générique donné par le modèle peut fusionner des éléments sans rapport : à surveiller en observant les premiers numéros.
- Coût : environ 0,09 $ par numéro (mesuré au dry-run).
