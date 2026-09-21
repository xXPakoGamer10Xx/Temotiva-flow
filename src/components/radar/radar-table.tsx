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
      <div className="flex flex-wrap items-center gap-2">
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
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
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
                <tr key={row.initiativeId} className="align-top transition-colors hover:bg-muted/40">
                  <td className="px-3 py-3">
                    <Link
                      href={`/radar?iniciativa=${row.initiativeId}` as Route}
                      scroll={false}
                      className="block space-y-1"
                    >
                      <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                        {row.initiativeId}
                      </span>
                      <span className="block max-w-56 font-medium leading-snug text-foreground hover:text-primary">
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
                      <span className="mt-1 block text-[11px] text-muted-foreground">{row.assignee.name}</span>
                    ) : null}
                  </td>
                  <td className="hidden max-w-48 px-3 py-3 text-muted-foreground lg:table-cell">
                    {row.currentTask ?? '—'}
                  </td>
                  <td className="px-3 py-3">
                    {row.dependencies.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <ul className="space-y-1">
                        {row.dependencies.map((dependency) => (
                          <li key={dependency.id} className="flex flex-wrap items-center gap-1.5">
                            <span aria-hidden="true">⏳</span>
                            <span className="font-medium">{DEPARTMENT_LABELS[dependency.department]}</span>
                            <span className="text-muted-foreground">
                              ({HELP_TYPE_LABELS[dependency.helpType]})
                            </span>
                            {dependency.isBlocking ? <Badge tone="danger">bloqueante</Badge> : null}
                            <span className="text-[11px] text-muted-foreground">
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
                      <span className="mt-1 block text-[11px] text-muted-foreground">
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
      className="h-7 rounded-full px-3 text-[11px]"
    >
      {children}
    </Button>
  );
}
