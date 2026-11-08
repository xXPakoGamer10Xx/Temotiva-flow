import { Button } from '@/components/ui/button';

/**
 * Página «Sin conexión» (spec 002 RF-04). El service worker la guarda al
 * instalarse y la sirve cuando una navegación falla por falta de red. Es
 * estática y sin sesión: no lleva datos del tablero, así que nada confidencial
 * queda en el dispositivo.
 *
 * «Reintentar» es un enlace normal (no `Link`): una navegación completa vuelve
 * a pasar por la red y, si ya hay conexión, abre el tablero. Así funciona
 * aunque los scripts de la app no estén disponibles sin red.
 */
export const dynamic = 'force-static';
export const metadata = { title: 'Sin conexión' };

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md space-y-4 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- PNG estático de marca, precacheado por el service worker */}
        <img src="/brand/cerebrin-saludando.png" alt="" width={64} height={64} className="mx-auto size-16 object-contain" />
        <p className="text-base font-medium">Sin conexión</p>
        <p className="text-xs text-fg-muted">
          No hay red en este momento. Temotiva Flow no guarda datos en el dispositivo, así que necesitas conexión
          para ver el tablero. Cuando vuelva, reintenta.
        </p>
        <Button asChild>
          <a href="/board">Reintentar</a>
        </Button>
      </div>
    </main>
  );
}
