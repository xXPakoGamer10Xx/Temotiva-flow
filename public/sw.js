/*
 * Service worker de Temotiva Flow (spec 002).
 *
 * - Instalable sin datos offline: solo se guardan la página «Sin conexión», sus
 *   hojas de estilo y tres imágenes de marca. Nunca vistas con datos ni
 *   respuestas de la API (spec 002 §3 y §10).
 * - Navegaciones: siempre a la red; si no hay red, «Sin conexión» (RF-04).
 * - Push: muestra el aviso y, al tocarlo, abre su vista (RF-15). Solo abre
 *   rutas del propio origen.
 *
 * Sin dependencias ni build: este archivo se sirve tal cual desde /sw.js.
 */

const CACHE_PREFIX = 'temoflow-';
const CACHE = `${CACHE_PREFIX}v1`;
const OFFLINE_URL = '/offline';
const FALLBACK_URL = '/notifications';
const STATIC_ASSETS = ['/brand/cerebrin-saludando.png', '/icons/icon-192.png', '/icons/badge-72.png'];
const ICON = '/icons/icon-192.png';
const BADGE = '/icons/badge-72.png';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(STATIC_ASSETS);
      // La página sin conexión y las hojas de estilo que enlaza, para que se vea bien sin red.
      const response = await fetch(OFFLINE_URL, { cache: 'reload' });
      if (response.ok) {
        const html = await response.clone().text();
        await cache.put(OFFLINE_URL, response);
        const styles = [...html.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)].map((match) => match[1]);
        if (styles.length > 0) await cache.addAll(styles);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()),
    );
    return;
  }

  // Solo los recursos de la página sin conexión: red primero, caché si no hay red.
  const isPrecached = STATIC_ASSETS.includes(url.pathname) || (url.pathname.startsWith('/_next/static/') && url.pathname.endsWith('.css'));
  if (!isPrecached || url.search) return;
  event.respondWith(fetch(request).catch(async () => (await caches.match(request)) || Response.error()));
});

/** Solo rutas relativas del propio origen; cualquier otra cosa abre el centro de notificaciones. */
function safePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return FALLBACK_URL;
  }
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin ? `${url.pathname}${url.search}${url.hash}` : FALLBACK_URL;
  } catch {
    return FALLBACK_URL;
  }
}

function readPayload(data) {
  if (!data) return {};
  try {
    const parsed = data.json();
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

self.addEventListener('push', (event) => {
  // Los navegadores exigen mostrar un aviso por cada push (userVisibleOnly).
  const payload = readPayload(event.data);
  const title = typeof payload.title === 'string' && payload.title ? payload.title : 'Temotiva Flow';
  const body = typeof payload.body === 'string' && payload.body ? payload.body : 'Tienes un aviso nuevo.';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: typeof payload.tag === 'string' ? payload.tag : undefined,
      icon: ICON,
      badge: BADGE,
      lang: 'es',
      data: { url: safePath(payload.url) },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => client.url.startsWith(self.location.origin));
      if (open && typeof open.navigate === 'function') {
        try {
          await open.navigate(target);
          await open.focus();
          return;
        } catch {
          // Una ventana no controlada por este worker no se puede navegar: se abre otra.
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
