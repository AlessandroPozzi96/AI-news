# Spécifications fonctionnelles

## Objectif

Newsletter hebdomadaire sur l'actualité des agents IA dans le développement logiciel, avec un focus sur Claude Code.

## Contenu couvert

- Sorties de nouveaux modèles
- Skills / plugins / serveurs MCP qui deviennent tendance
- Évolution des bonnes pratiques
- Nouvelles commandes et raccourcis (Claude Code en priorité)
- Autres outils d'agents de code (en second plan)

Chaque élément porte une catégorie parmi : `modèle`, `skill/outil`, `bonne pratique`, `commande/raccourci`, `autre`.

## F1 — E-mail

- Envoi **100 % automatique**, sans validation préalable.
- Contient **N éléments** (5 au départ, 10 possible).
- Chaque élément : titre accrocheur + résumé de 1 à 2 phrases + catégorie.
- Un clic sur un élément ouvre sa page de détails.
- Langue : **français par défaut**, configurable.
- Lien de désinscription dans chaque e-mail.

## F2 — Page de détails d'un élément

- Titre, résumé étendu, lien vers la source originale.
- Si pertinent : commandes d'installation / d'utilisation.
- URL stable et publique, de la forme `/issue/<semaine>/<item>`.
- Forme finale (artifact ou site web) : site servi par l'infrastructure (voir `infrastructure.md`).

## F3 — Dashboard admin

- **Destinataires** : lister, ajouter, supprimer, activer/désactiver (au départ : une seule adresse, la mienne).
- **Fréquence d'envoi** : jour(s) et rythme configurables (hebdomadaire par défaut).
- **Nombre d'éléments** par e-mail : 5 ou 10.
- **Langue** de la newsletter : français par défaut, option pour en changer (anglais au minimum).
- **Actions** : « envoyer maintenant », prévisualiser le prochain numéro.
- Historique des numéros envoyés.

## F4 — Génération

- Collecte depuis des sources définies, dédoublonnage, sélection par pertinence, rédaction dans la langue configurée.
- Un élément déjà publié dans un numéro précédent n'est pas republié.

## Hors périmètre (pour l'instant)

- Validation manuelle avant envoi.
- Inscription publique par formulaire.
- Statistiques d'ouverture/clic avancées.

## Décisions complémentaires

- Envoi par défaut : **vendredi 18:00, heure de Paris**, configurable ; le numéro couvre les 7 derniers jours.
- Langues supportées : **français et anglais**.
- Sources de collecte : liste définie dans `infrastructure.md`, extensible par configuration.
- Focus Claude Code : au moins 2 éléments sur 5 le concernent, s'il y en a.
- Pages de détails publiques et non indexées.
