'use client';

import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { dismissToast, useToasts, type ToastTone } from '@/lib/toast';

const TONE_CLASS: Record<ToastTone, string> = {
  success: 'tone-success',
  danger: 'tone-danger',
  info: 'tone-info',
};

const TONE_ICON = { success: CheckCircle2, danger: TriangleAlert, info: Info } as const;

/** Región `aria-live` con los avisos activos, abajo a la derecha (centrada en móvil). */
export function Toaster() {
  const toasts = useToasts();

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-[70] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:items-end"
    >
      {toasts.map((item) => {
        const Icon = TONE_ICON[item.tone];
        return (
          <div
            key={item.id}
            className="pointer-events-auto flex max-w-sm items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg shadow-[var(--shadow-lift)]"
          >
            <span className={`${TONE_CLASS[item.tone]} grid size-6 shrink-0 place-items-center rounded-md`}>
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">{item.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(item.id)}
              className="inline-flex size-6 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg"
              aria-label="Cerrar aviso"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
