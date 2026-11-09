'use client';

import * as React from 'react';
// Carga el almacén de instalación cuanto antes: `beforeinstallprompt` puede llegar
// antes de que monte la barra lateral (spec 002 RF-05a).
import './install-store';

/**
 * Registra el service worker en cualquier vista (spec 002 RF-03), incluida la
 * de acceso, para que la app sea instalable antes de entrar.
 *
 * `updateViaCache: 'none'` obliga al navegador a comprobar siempre `/sw.js`, así
 * que una versión nueva se aplica sin reinstalar. Sin soporte, no hace nada.
 */
export function ServiceWorkerRegistrar() {
  React.useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // Sin service worker la app funciona igual, solo que sin instalación ni push.
    });
  }, []);
  return null;
}
