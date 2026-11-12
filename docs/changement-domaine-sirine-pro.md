# Passer le site commercial sur sirine.pro

La marque reste **Sirine** (logo inchangé) ; seule l'adresse du site commercial change :
`horaneo.com` → `sirine.pro`. Rien n'est à modifier dans le code : tout passe par les
réglages de Coolify et par le gestionnaire du nom de domaine.

## Ce qui continue de marcher pendant et après le changement

- `horaneo.com` et `horaneo.fr` redirigent vers `https://sirine.pro/fr` (même page).
- Les sites des clients déjà créés gardent leur adresse en `.horaneo.com` (ou leur propre domaine).
  Les nouveaux sites seront en `.sirine.pro`.
- Les notifications de paiement Stripe et les agendas synchronisés répondent sur l'ancien
  comme sur le nouveau domaine (adresses `/api/stripe` et `/api/calendar`, sans redirection).

## Étapes

1. **Acheter `sirine.pro`.**
2. **Chez le fournisseur du domaine `sirine.pro`** : ajouter uniquement des enregistrements **A**
   vers l'adresse IP du serveur (la même que pour `horaneo.com`) :
   - `sirine.pro` (souvent noté `@`) ;
   - `www` ;
   - `*` (tous les sous-domaines, pour les sites des nouveaux clients).

   Ne pas toucher aux enregistrements **MX** ni **TXT** (e-mails).
3. **Dans Coolify, onglet du domaine de l'application** : ajouter `https://sirine.pro`,
   `https://www.sirine.pro` et les sous-domaines `*.sirine.pro`, en gardant ceux de `horaneo.com`
   et `horaneo.fr`.
4. **Dans Coolify, variables d'environnement** :
   - `MAIN_DOMAIN=sirine.pro`
   - `LOCALE_REDIRECT_DOMAINS=horaneo.fr=fr,horaneo.com=fr`
   - `SUPPORT_EMAIL=support@horaneo.com` et `EMAIL_FROM_ADDRESS=no-reply@horaneo.com` : les
     e-mails restent sur `horaneo.com` tant que l'envoi n'est pas configuré pour `sirine.pro`.
   - `PUBLIC_APP_URL` : à vider ou à mettre à `https://sirine.pro` s'il est renseigné.

   Puis **Deploy**.
5. **Connexion avec Google** (si elle est activée) : dans la console Google, ajouter l'adresse de
   retour `https://sirine.pro/api/auth/callback/google`.
6. **Stripe** (conseillé) : remplacer `horaneo.com` par `sirine.pro` dans l'adresse des points de
   terminaison (webhooks). L'ancienne adresse continue de fonctionner en attendant.
7. Chaque utilisatrice se reconnecte une fois (la connexion est liée au nom de domaine).
