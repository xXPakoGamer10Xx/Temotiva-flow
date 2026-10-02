'use client';

import * as React from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import type { Department } from '@/domain/enums';
import { DEPARTMENTS } from '@/domain/enums';
import { DEPARTMENT_LABELS, DEPARTMENT_SHORT, HELP_TYPE_LABELS, STOP_REASON_LABELS } from '@/domain/labels';
import type { FlowState, RadarRow } from '@/server/services/views';
import { Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { DepartmentChip, FlowStateBadge, PriorityBadge, SleClock } from '@/components/shared/signals';
import { formatRelative } from '@/lib/utils';

/**
 * Vista 2 — Radar de Esperas (TemoFlow.md §3.2).
 *
 * Responde de un vistazo a "¿qué está esperando esta iniciativa?". El filtro
 * por departamento cruza propiedad y destinatario de la solicitud: así Legal ve
 * tanto lo suyo como lo que le están pidiendo.
 */
export function RadarTable({ rows }: { rows: RadarRow[] }) {
  const [department, setDepartment] = React.useState<Department | 'ALL'>('ALL');
  const [state, setState] = React.useState<FlowState | 'ALL'>('ALL');

  const filtered = rows.filter((row) => {
    const matchesDepartment =
      department === 'ALL' ||
      row.ownerDepartment === department ||
      row.dependencies.some((dependency) => dependency.department === department);
    const matchesState = state === 'ALL' || row.flowState === state;
    return matchesDepartment && matchesState;
  });

  const blocked = rows.filter((row) => row.flowState === 'BLOCKED').length;
  const parallel = rows.filter((row) => row.flowState === 'PARALLEL').length;

  return (
    <div className="space-y-4">
      <div className="scrollbar-slim -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible [&>*]:shrink-0">
        <FilterChip active={state === 'ALL'} onClick={() => setState('ALL')}>
          Todas ({rows.length})
        </FilterChip>
        <FilterChip active={state === 'BLOCKED'} onClick={() => setState('BLOCKED')}>
          ⛔ Paradas ({blocked})
        </FilterChip>
        <FilterChip active={state === 'PARALLEL'} onClick={() => setState('PARALLEL')}>
          🟡 En paralelo ({parallel})
        </FilterChip>

        <span className="mx-1 hidden h-5 w-px bg-border sm:block" />

        <FilterChip active={department === 'ALL'} onClick={() => setDepartment('ALL')}>
          Todos los departamentos
        </FilterChip>
        {DEPARTMENTS.map((value) => (
          <FilterChip key={value} active={department === value} onClick={() => setDepartment(value)}>
            {DEPARTMENT_SHORT[value]}
          </FilterChip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nada que mostrar con estos filtros"
          description="Prueba con otro departamento o quita el filtro de estado."
        />
      ) : (
        <>
        <ul className="space-y-2 md:hidden" aria-label="Iniciativas y sus esperas">
          {filtered.map((row) => (
            <li key={row.initiativeId} className="space-y-2 rounded-lg border border-border bg-surface p-3">
              <Link href={`/radar?iniciativa=${row.initiativeId}` as Route} scroll={false} className="block space-y-1">
                <span className="font-mono text-xs font-semibold text-fg-muted">{row.initiativeId}</span>
                <span className="block font-medium leading-snug text-fg">{row.title}</span>
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <FlowStateBadge state={row.flowState} />
                <PriorityBadge priority={row.priority} reason={row.priorityReason} compact />
                <DepartmentChip department={row.ownerDepartment} />
              </div>
              <p className="text-xs text-fg-muted">
                {row.stageName} · <SleClock reading={row.sle} className="inline-flex" />
              </p>
              {row.dependencies.length > 0 ? (
                <ul className="space-y-1 border-t border-border pt-2 text-xs">
                  {row.dependencies.map((dependency) => (
                    <li key={dependency.id} className="flex flex-wrap items-center gap-1.5">
                      <span aria-hidden="true">⏳</span>
                      <span className="font-medium">{DEPARTMENT_LABELS[dependency.department]}</span>
                      <span className="text-fg-muted">({HELP_TYPE_LABELS[dependency.helpType]})</span>
                      {dependency.isBlocking ? <Badge tone="danger">bloqueante</Badge> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {row.flowState === 'BLOCKED' && (row.stopReason || row.blockedDescription) ? (
                <p className="text-xs text-fg-muted">
                  {row.stopReason ? STOP_REASON_LABELS[row.stopReason] : ''}
                  {row.blockedDescription ? ` · ${row.blockedDescription}` : ''}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="scrollbar-slim hidden overflow-x-auto rounded-lg border border-border md:block">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-fg-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Iniciativa</th>
                <th scope="col" className="px-3 py-2 font-medium">Fase</th>
                <th scope="col" className="px-3 py-2 font-medium">Propietario</th>
                <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">Tarea en curso</th>
                <th scope="col" className="px-3 py-2 font-medium">Dependencias activas</th>
                <th scope="col" className="px-3 py-2 font-medium">Estado de flujo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((row) => (
                <tr key={row.initiativeId} className="align-top transition-colors hover:bg-surface-2/60">
                  <td className="px-3 py-3">
                    <Link
                      href={`/radar?iniciativa=${row.initiativeId}` as Route}
                      scroll={false}
                      className="block space-y-1"
                    >
                      <span className="font-mono text-xs font-semibold text-fg-muted">
                        {row.initiativeId}
                      </span>
                      <span className="block max-w-56 font-medium leading-snug text-fg hover:text-accent-text">
                        {row.title}
                      </span>
                      <PriorityBadge priority={row.priority} reason={row.priorityReason} compact />
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <span className="block">{row.stageName}</span>
                    <SleClock reading={row.sle} className="mt-1" />
                  </td>
                  <td className="px-3 py-3">
                    <DepartmentChip department={row.ownerDepartment} />
                    {row.assignee ? (
                      <span className="mt-1 block text-xs text-fg-muted">{row.assignee.name}</span>
                    ) : null}
                  </td>
                  <td className="hidden max-w-48 px-3 py-3 text-fg-muted lg:table-cell">
                    {row.currentTask ?? '—'}
                  </td>
                  <td className="px-3 py-3">
                    {row.dependencies.length === 0 ? (
                      <span className="text-fg-muted">—</span>
                    ) : (
                      <ul className="space-y-1">
                        {row.dependencies.map((dependency) => (
                          <li key={dependency.id} className="flex flex-wrap items-center gap-1.5">
                            <span aria-hidden="true">⏳</span>
                            <span className="font-medium">{DEPARTMENT_LABELS[dependency.department]}</span>
                            <span className="text-fg-muted">
                              ({HELP_TYPE_LABELS[dependency.helpType]})
                            </span>
                            {dependency.isBlocking ? <Badge tone="danger">bloqueante</Badge> : null}
                            <span className="text-xs text-fg-muted">
                              {formatRelative(dependency.createdAt)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <FlowStateBadge state={row.flowState} />
                    {row.flowState === 'BLOCKED' ? (
                      <span className="mt-1 block text-xs text-fg-muted">
                        {row.stopReason ? STOP_REASON_LABELS[row.stopReason] : ''}
                        {row.blockedDescription ? ` · ${row.blockedDescription}` : ''}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant={active ? 'default' : 'outline'}
      onClick={onClick}
      aria-pressed={active}
      className="h-7 rounded-full px-3 text-xs"
    >
      {children}
    </Button>
  );
}
