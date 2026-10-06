import { cn } from '@/lib/utils';

/** Bloque gris que respira: marca el hueco de lo que está cargando. */
function Bone({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-3', className)} aria-hidden="true" />;
}

/**
 * Esqueleto de carga del contenido (cabecera + cuerpo). El marco (barra lateral,
 * paleta, guía) vive en `app/(app)/layout.tsx` y permanece en pantalla, así que
 * aquí solo se dibuja lo que cambia. Aparece con un pequeño retraso
 * (`.skeleton-delay`) para que las cargas rápidas no muestren un destello.
 * Cada página usa su variante: columnas para el tablero, filas para el resto.
 */
export function PageSkeleton({ variant = 'list' }: { variant?: 'board' | 'list' | 'cards' }) {
  return (
    <div
      className="skeleton-delay flex min-h-0 min-w-0 flex-1 flex-col"
      role="status"
      aria-busy="true"
      aria-label="Cargando la vista"
    >
      <div className="border-b border-border px-4 py-3 sm:px-6">
        <Bone className="h-4 w-44" />
        <Bone className="mt-2 h-3 w-72 max-w-full" />
      </div>

      {variant === 'board' ? (
        <div className="flex flex-1 gap-3 overflow-hidden px-4 pt-4 sm:px-6">
          {Array.from({ length: 5 }, (_, column) => (
            <div key={column} className="w-[17.5rem] shrink-0 space-y-2">
              <Bone className="h-4 w-32" />
              <Bone className="h-24 w-full" />
              <Bone className="h-24 w-full" />
            </div>
          ))}
        </div>
      ) : variant === 'cards' ? (
        <div className="grid gap-3 px-4 py-4 sm:px-6 lg:grid-cols-2">
          <Bone className="h-28" />
          <Bone className="h-28" />
          <Bone className="h-52 lg:col-span-2" />
        </div>
      ) : (
        <div className="space-y-2 px-4 py-4 sm:px-6">
          {Array.from({ length: 6 }, (_, row) => (
            <Bone key={row} className="h-14 w-full" />
          ))}
        </div>
      )}
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
