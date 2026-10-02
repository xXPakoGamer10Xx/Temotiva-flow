'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** Frontera de error de las vistas: explica qué pasó y ofrece una salida, nunca una pantalla en blanco. */
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md space-y-4 text-center">
        <p className="text-[15px] font-medium">Algo no ha salido como esperábamos</p>
        <p className="text-xs text-fg-muted">
          No se ha perdido ningún dato: cada cambio se guarda en el servidor al confirmarlo. Prueba a recargar la vista y,
          si vuelve a pasar, avisa a Dirección.
        </p>
        <div className="flex items-center justify-center gap-2">
          <Button onClick={reset}>Reintentar</Button>
          <Button variant="outline" asChild>
            <Link href="/board">Ir al tablero</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
