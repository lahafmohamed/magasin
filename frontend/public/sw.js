// Service worker retiré (lot 29-A, 2026-11-28).
//
// L'ancien service worker répondait à une coupure réseau par un statut 200
// `{ success: false }` : l'application le prenait pour un succès et affichait
// « Vente enregistrée », « Paiement enregistré » ou « Caisse clôturée » alors
// que rien n'était écrit.
//
// Ce fichier reste servi à la même adresse (`/sw.js`, en `no-cache`) pour que
// chaque navigateur qui avait installé l'ancien le remplace par celui-ci à sa
// prochaine visite. Il n'intercepte aucune requête (pas d'écouteur `fetch`),
// vide tous les caches et se désinscrit. Il ne recharge pas la page : un
// rechargement viderait un panier en cours.
//
// Chrome ne l'active qu'une fois fermés les onglets que l'ancien garde occupé
// (rejeu du 2026-11-28) : c'est `retirerServiceWorker` (src/main.tsx) qui
// retire l'ancien dès la première visite de la nouvelle version. Celui-ci
// reste le filet pour un navigateur qui rouvrirait une ancienne version.
//
// Ne pas supprimer ce fichier : un 404, ou `index.html` servi à sa place par
// le repli de nginx, laisse l'ancien service worker en place.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
    })()
  );
});
