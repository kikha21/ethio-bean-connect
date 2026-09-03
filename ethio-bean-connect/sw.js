/* The service worker exists for one reason: a push arrives when the page
   is closed, so something outside the page has to be awake to show it.
   It caches nothing and intercepts no requests. */

self.addEventListener('push', function (event) {
  var data = { title: 'Ethio Bean Connect', body: 'You have a new message.', url: '/' };
  try { if (event.data) data = Object.assign(data, event.data.json()); } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/assets/logo.jpg',
      badge: '/assets/logo.jpg',
      tag: data.tag || 'ebc-chat',      /* a second reply replaces the first rather than stacking */
      renotify: true,
      data: { url: data.url }
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      /* if the site is already open somewhere, bring that tab forward
         instead of opening a second one */
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) {
          c.postMessage({ ebc: 'open-chat' });
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });
