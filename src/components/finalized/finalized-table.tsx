'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Route } from 'next';
import { Search } from 'lucide-react';
import { TSHIRT_SIZE_LABELS } from '@/domain/labels';
import { formatDuration } from '@/domain/task-read';
import type { FinalizedRow } from '@/server/services/views';
import { Badge, EmptyState, Input } from '@/components/ui/primitives';
import { DepartmentChip, PriorityBadge } from '@/components/shared/signals';
import { formatDateTime } from '@/lib/utils';

/** Lista de iniciativas finalizadas, con buscador por id o título. */
export function FinalizedTable({ rows, query }: { rows: FinalizedRow[]; query: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = React.useState(query);

  const search = (event: React.FormEvent): void => {
    event.preventDefault();
    const next = value.trim();
    router.push((next ? `${pathname}?q=${encodeURIComponent(next)}` : pathname) as Route, { scroll: false });
  };

  const linkTo = (id: string): Route => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    params.set('iniciativa', id);
    return `${pathname}?${params.toString()}` as Route;
  };

  return (
    <div className="space-y-4">
      <form onSubmit={search} role="search" className="relative max-w-sm">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
        <Input
          aria-label="Buscar en finalizadas"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Buscar por TEMO-XXX o título"
          className="pl-8"
        />
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title={query ? 'Ninguna finalizada coincide con la búsqueda' : 'Todavía no hay iniciativas finalizadas'}
          description={
            query
              ? 'Prueba con otro identificador o parte del título.'
              : 'Cuando Tech apruebe Producción y alguien finalice una iniciativa, saldrá del tablero y aparecerá aquí.'
          }
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={linkTo(row.id)}
                scroll={false}
                className="flex flex-col gap-2 px-3 py-3 transition-colors hover:bg-surface-2/60 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <span className="font-mono text-xs font-semibold text-fg-muted">{row.id}</span>
                  <span className="block font-medium leading-snug text-fg">{row.title}</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <PriorityBadge priority={row.priority} reason={row.priorityReason} compact />
                    <DepartmentChip department={row.ownerDepartment} />
                    {row.tshirtSize ? <Badge tone="info">T-shirt {TSHIRT_SIZE_LABELS[row.tshirtSize]}</Badge> : null}
                    {row.overrideCount > 0 ? (
                      <Badge tone="warning">
                        <span aria-hidden="true">⚠️</span> {row.overrideCount} excepcional{row.overrideCount > 1 ? 'es' : ''}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 space-y-0.5 text-xs text-fg-muted sm:text-right">
                  <p className="tabular-nums">Finalizada el {formatDateTime(row.finalizedAt)}</p>
                  <p>{row.finalizedBy ? `por ${row.finalizedBy.name}` : ''}</p>
                  <p className="tabular-nums text-fg-subtle">Ciclo completo: {formatDuration(row.totalMs)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
