/*
 * Service worker de l'espace gérante : reçoit les notifications (Web Push)
 * même quand l'espace est fermé, et ouvre la bonne page quand on les touche.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "", {
      body: data.body || "",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      icon: "/api/app/icon/192",
      badge: "/api/app/icon/96",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // Un onglet de l'espace déjà ouvert : on le réutilise.
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "navigate" in client) {
          return client.focus().then(() => client.navigate(url));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
