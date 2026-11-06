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
- Contient **7 éléments**, en trois sections dans cet ordre : **3 actualités**, **2 indispensables** (outils, serveurs MCP, skills, techniques), **2 Claude Code** (nouveautés, tutoriels, réglages). Chaque section a un titre discret ; un numéro sans section (ancien) n'en a pas.
- Chaque élément : titre accrocheur + résumé d'une phrase.
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
- **Langue** de la newsletter : français par défaut, option pour en changer (anglais au minimum).
- **Actions** :
  - « Envoyer maintenant » : génère un **nouveau** numéro et l'envoie tout de suite à tous les destinataires actifs. Pas de limite de nombre, pas de confirmation. Le numéro porte un suffixe (`2026-S45-2`, puis `-3`…) et n'interfère pas avec l'envoi automatique de la semaine.
  - Prévisualiser le prochain numéro (à faire).
- Historique des numéros envoyés et des exécutions.

## F4 — Génération

- Collecte depuis des sources datées (7 derniers jours) et non datées (catalogue, dépôts populaires, documentation Claude Code).
- Sélection par section (ADR-0003) : un tri par section, avec ses propres critères ; une même histoire n'apparaît jamais deux fois.
- Un élément déjà publié dans un numéro précédent n'est pas republié, datée ou non.
- Rédaction dans la langue configurée, avec une consigne propre à chaque section.

## Hors périmètre (pour l'instant)

- Validation manuelle avant envoi.
- Inscription publique par formulaire.
- Statistiques d'ouverture/clic avancées.

## Décisions complémentaires

- Envoi par défaut : **vendredi 18:00, heure de Paris**, configurable ; le numéro couvre les 7 derniers jours.
- Langues supportées : **français et anglais**.
- Sources de collecte : liste définie dans `infrastructure.md`, extensible par configuration.
- Structure fixe 3 / 2 / 2 (ADR-0003). Envoi seulement si le numéro compte au moins 3 éléments dont 1 Claude Code ; sinon échec et alerte, rien n'est envoyé.
- Pages de détails publiques et non indexées.
