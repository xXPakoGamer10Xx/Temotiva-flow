'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { Archive, Search, X } from 'lucide-react';
import type { Department } from '@/domain/enums';
import { DEPARTMENTS } from '@/domain/enums';
import { DEPARTMENT_LABELS, DEPARTMENT_SHORT } from '@/domain/labels';
import { UI_EVENTS, useUiEvent } from '@/components/command/command-bus';
import { Kbd } from '@/components/ui/primitives';
import { DepartmentDot } from '@/components/shared/signals';
import { cn } from '@/lib/utils';

/**
 * Filtros rápidos del tablero.
 *
 * Viven en la URL (`?dep=&estado=&q=`), así que un tablero filtrado se puede
 * pegar en un chat y quien lo abra ve exactamente lo mismo. El filtrado ocurre
 * en el servidor; aquí solo se recoge la intención.
 */
export function BoardFilters({
  counts,
}: {
  counts: { total: number; blocked: number; atRisk: number; byDepartment: Record<Department, number> };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const department = searchParams.get('dep') as Department | null;
  const flow = searchParams.get('estado');
  const archived = searchParams.get('archivadas') === '1';
  const [query, setQuery] = React.useState(searchParams.get('q') ?? '');

  useUiEvent(UI_EVENTS.focusFilter, () => inputRef.current?.focus());

  const apply = React.useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      // La ficha abierta no tiene por qué sobrevivir a un cambio de filtro.
      next.delete('iniciativa');
      const queryString = next.toString();
      router.replace((queryString ? `/board?${queryString}` : '/board') as Route, { scroll: false });
    },
    [router, searchParams],
  );

  // El texto se envía con retardo para no navegar en cada tecla.
  React.useEffect(() => {
    const current = searchParams.get('q') ?? '';
    if (query === current) return;
    const timer = window.setTimeout(() => apply({ q: query || null }), 250);
    return () => window.clearTimeout(timer);
  }, [apply, query, searchParams]);

  const hasFilters = Boolean(department || flow || query || archived);

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-4 py-2 sm:px-6">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setQuery('');
              inputRef.current?.blur();
            }
          }}
          placeholder="Filtrar iniciativas…"
          aria-label="Filtrar iniciativas por texto"
          className="h-7 w-48 rounded-md border border-border bg-surface pl-7 pr-7 text-xs text-fg transition-colors placeholder:text-fg-subtle hover:border-border-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklch,var(--accent)_20%,transparent)]"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-fg-subtle transition-colors hover:text-fg"
            aria-label="Limpiar el texto del filtro"
          >
            <X className="size-3" />
          </button>
        ) : (
          <Kbd className="absolute right-1.5 top-1/2 -translate-y-1/2">/</Kbd>
        )}
      </div>

      <span className="mx-1 hidden h-4 w-px bg-border sm:block" />

      <FilterChip active={!flow} onClick={() => apply({ estado: null })}>
        Todas
        <Count value={counts.total} />
      </FilterChip>
      <FilterChip
        active={flow === 'parada'}
        tone="danger"
        onClick={() => apply({ estado: flow === 'parada' ? null : 'parada' })}
      >
        Paradas
        <Count value={counts.blocked} />
      </FilterChip>
      <FilterChip
        active={flow === 'riesgo'}
        tone="warning"
        onClick={() => apply({ estado: flow === 'riesgo' ? null : 'riesgo' })}
      >
        En riesgo
        <Count value={counts.atRisk} />
      </FilterChip>

      <span className="mx-1 hidden h-4 w-px bg-border sm:block" />

      <div className="flex flex-wrap items-center gap-1">
        {DEPARTMENTS.map((value) => (
          <FilterChip
            key={value}
            active={department === value}
            title={DEPARTMENT_LABELS[value]}
            onClick={() => apply({ dep: department === value ? null : value })}
          >
            <DepartmentDot department={value} />
            {DEPARTMENT_SHORT[value]}
            <Count value={counts.byDepartment[value] ?? 0} />
          </FilterChip>
        ))}
      </div>

      <span className="mx-1 hidden h-4 w-px bg-border sm:block" />

      <FilterChip active={archived} onClick={() => apply({ archivadas: archived ? null : '1' })}>
        <Archive className="size-3" />
        Archivadas
      </FilterChip>

      {hasFilters ? (
        <button
          type="button"
          onClick={() => {
            setQuery('');
            apply({ dep: null, estado: null, q: null, archivadas: null });
          }}
          className="ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <X className="size-3" />
          Limpiar filtros
        </button>
      ) : null}
    </div>
  );
}

function Count({ value }: { value: number }) {
  return <span className="tabular-nums opacity-60">{value}</span>;
}

function FilterChip({
  active,
  tone = 'accent',
  onClick,
  title,
  children,
}: {
  active: boolean;
  tone?: 'accent' | 'danger' | 'warning';
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const activeTone = { accent: 'tone-accent', danger: 'tone-danger', warning: 'tone-warning' }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors',
        active
          ? activeTone
          : 'border border-transparent text-fg-muted hover:border-border hover:bg-surface-2 hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}
