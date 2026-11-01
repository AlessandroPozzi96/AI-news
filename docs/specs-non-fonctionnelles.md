# Spécifications non fonctionnelles

## Coût

- Cible : proche de 0 €/mois (hébergement dans les paliers gratuits/à l'usage, API LLM de quelques centimes à quelques euros par mois).
- Pas de serveur à maintenir ni de machine allumée en permanence.

## Fiabilité

- Envoi 100 % automatique : une exécution en échec ne doit pas passer inaperçue.
- Idempotence : un numéro de la semaine n'est envoyé qu'une fois, même si le cron se redéclenche.
- Échec de collecte partiel (une source indisponible) : le numéro est produit avec les sources restantes.
- Échec de génération ou d'envoi : notification d'erreur à l'administrateur et possibilité de relancer depuis le dashboard.

## Sécurité

- Dashboard admin non accessible publiquement sans authentification.
- Clés API et secrets uniquement dans les secrets de l'hébergeur, jamais dans le dépôt.
- Contenu issu du web traité comme donnée non fiable : le LLM ne doit pas exécuter d'instructions présentes dans les sources (prompt injection).
- Pages de détails : contenu échappé/assaini avant affichage.

## Conformité et vie privée

- Lien de désinscription fonctionnel dans chaque e-mail.
- Stockage minimal des destinataires (adresse e-mail, statut, date).
- Respect du RGPD dès qu'il y a d'autres destinataires que moi.

## Maintenabilité

- Couche LLM interchangeable (Claude par défaut) pour changer de fournisseur sans réécrire le pipeline.
- Sources de collecte déclarées en configuration, ajout sans modifier la logique.
- Configuration (fréquence, nombre d'éléments, langue, destinataires) modifiable depuis le dashboard, sans redéploiement.

## Performance

- Pas de contrainte forte : un traitement par semaine, quelques destinataires.
- Pages de détails et dashboard : chargement rapide (pages légères, mises en cache côté Cloudflare).

## Délivrabilité

- Phase 1 (sans domaine) : envoi vers ma seule adresse via l'expéditeur de test du fournisseur.
- Phase 2 (autres destinataires) : domaine dédié avec SPF/DKIM/DMARC configurés.
