'use client';

import * as React from 'react';
import Link from 'next/link';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { CircleHelp } from 'lucide-react';
import { GLOSSARY, type GlossaryKey } from '@/domain/glossary';
import { cn } from '@/lib/utils';

/**
 * Ayuda contextual: un icono ⓘ junto a un concepto que se abre con clic, toque
 * o teclado (no solo al pasar el ratón, que en tablet no existe). Lee del
 * glosario, así que la explicación es la misma en todas partes.
 */
export function InfoHint({ term, className }: { term: GlossaryKey; className?: string }) {
  const entry = GLOSSARY[term];

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        type="button"
        aria-label={`Qué es: ${entry.title}`}
        className={cn(
          'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-surface-2 hover:text-accent-text',
          className,
        )}
      >
        <CircleHelp className="size-3.5" aria-hidden="true" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-[80] w-72 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-surface p-3 text-left shadow-[var(--shadow-lift)]"
        >
          <p className="text-sm font-medium text-fg">{entry.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">{entry.short}</p>
          <Link
            href={`/ayuda#${term}`}
            className="mt-2 inline-block text-xs font-medium text-accent-text hover:underline"
          >
            Más en Ayuda
          </Link>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
