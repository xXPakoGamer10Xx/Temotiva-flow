'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Panel lateral que entra desde la derecha, construido sobre el diálogo de
 * Radix: mantiene el foco atrapado, el cierre con Escape y el aria correcto,
 * pero sin tapar el contexto detrás como hacía el modal centrado.
 *
 * La animación vive en `globals.css`, enganchada a `data-motion` y al
 * `data-state` que marca Radix.
 */

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-motion="overlay"
        className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[1px] dark:bg-black/55"
      />
      <DialogPrimitive.Content
        data-motion="sheet"
        // Al abrir, el foco va al panel, no al primer botón: así no aparece un
        // anillo de foco sobre el aspa nada más deslizarse.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-[min(44rem,100vw)] max-sm:w-screen flex-col border-l border-border bg-surface shadow-[var(--shadow-panel)] outline-none',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-border px-5 py-4', className)} {...props} />;
}

export function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-base font-medium leading-snug tracking-tight text-fg', className)}
      {...props}
    />
  );
}

export function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-xs text-fg-muted', className)} {...props} />;
}

export function SheetBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('scrollbar-slim flex-1 overflow-y-auto px-5 py-5', className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3', className)}
      {...props}
    />
  );
}

/** Botón de cierre con su atajo a la vista, arriba a la derecha del panel. */
export function SheetCloseButton({ className }: { className?: string }) {
  return (
    <DialogPrimitive.Close
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg',
        className,
      )}
      aria-label="Cerrar panel (Esc)"
      title="Cerrar (Esc)"
    >
      <X className="size-4" />
    </DialogPrimitive.Close>
  );
}
