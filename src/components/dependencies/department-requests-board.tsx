'use client';

import * as React from 'react';
import Link from 'next/link';
import { ExternalLink, Paperclip, Plus, Search } from 'lucide-react';
import type { Department } from '@/domain/enums';
import { DEPARTMENT_LABELS, HELP_TYPE_LABELS } from '@/domain/labels';
import { MAX_CLOSED_INBOX_ITEMS } from '@/domain/rules';
import type { DepartmentRequestView, DepartmentRequestsView, InitiativeDependencyView } from '@/server/services/department-requests';
import { formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Input, Select } from '@/components/ui/primitives';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DepartmentChip } from '@/components/shared/signals';
import {
  DependencyStatusBadge,
  InitiativeDependencyBadge,
  RealBlockingBadge,
  RequestBlockingBadge,
  RequestStatusBadge,
} from './inbox-badges';
import {
  DEFAULT_INBOX_FILTERS,
  buildInboxItems,
  countByTab,
  filterInboxItems,
  involvedDepartments,
  type InboxFilters,
  type InboxStatusFilter,
  type InboxTab,
} from './inbox-model';
import { NewRequestDialog, RequestDetailDialog, initiativeSheetHref } from './request-dialogs';

/**
 * Buzón de Dependencias (spec 001). Recibe del servidor solo las filas que la
 * sesión puede ver; las pestañas y filtros son comodidad, nunca seguridad.
 */

const TAB_LABELS: Record<InboxTab, string> = {
  INCOMING: 'Para mi equipo',
  OUTGOING: 'De mi equipo',
  ALL: 'Todas',
};

const STATUS_FILTER_LABELS: Record<InboxStatusFilter, string> = {
  OPEN: 'Abiertas',
  PENDING: 'Pendientes',
  IN_PROGRESS: 'En curso',
  CLOSED: 'Cerradas',
  ALL: 'Cualquier estado',
};

export function DepartmentRequestsBoard(view: DepartmentRequestsView) {
  const [filters, setFilters] = React.useState<InboxFilters>(DEFAULT_INBOX_FILTERS);
  const [creating, setCreating] = React.useState(false);
  const [openRequestId, setOpenRequestId] = React.useState<string | null>(null);

  const items = React.useMemo(() => buildInboxItems(view), [view]);
  const visible = filterInboxItems(items, filters);
  const counts = countByTab(items, filters);
  const departments = involvedDepartments(items);
  // Se busca en las filas frescas: tras tomar o resolver, el detalle refleja el nuevo estado.
  const openRequest = view.requests.find((request) => request.id === openRequestId) ?? null;

  const update = (patch: Partial<InboxFilters>): void => setFilters((current) => ({ ...current, ...patch }));
  const filtersActive =
    filters.status !== DEFAULT_INBOX_FILTERS.status ||
    filters.department !== 'ALL' ||
    filters.onlyBlocking ||
    filters.query.trim() !== '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Tabs value={filters.tab} onValueChange={(tab) => update({ tab: tab as InboxTab })} className="mr-auto">
          {/* overflow-x-auto arrastra overflow-y; el -mb-px de las pestañas pintaba un scroll vertical. */}
          <TabsList aria-label="Bandeja" className="overflow-y-hidden">
            {(Object.keys(TAB_LABELS) as InboxTab[]).map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {TAB_LABELS[tab]}
                <span className="tabular-nums text-fg-subtle">{counts[tab]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {view.canCreate ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden /> Nueva petición
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <Input
            type="search"
            value={filters.query}
            onChange={(event) => update({ query: event.target.value })}
            placeholder="Buscar por título, texto o TEMO-…"
            aria-label="Buscar peticiones"
            className="h-8 pl-8"
          />
        </div>
        <div className="w-[calc(50%-0.25rem)] sm:w-40">
          <Select
            value={filters.status}
            onChange={(event) => update({ status: event.target.value as InboxStatusFilter })}
            aria-label="Filtrar por estado"
          >
            {(Object.keys(STATUS_FILTER_LABELS) as InboxStatusFilter[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_FILTER_LABELS[status]}
              </option>
            ))}
          </Select>
        </div>
        {departments.length > 1 ? (
          <div className="w-[calc(50%-0.25rem)] sm:w-48">
            <Select
              value={filters.department}
              onChange={(event) => update({ department: event.target.value as Department | 'ALL' })}
              aria-label="Filtrar por área implicada"
            >
              <option value="ALL">Todas las áreas</option>
              {departments.map((department) => (
                <option key={department} value={department}>
                  {DEPARTMENT_LABELS[department]}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <label className="flex items-center gap-1.5 text-xs text-fg-muted">
          <input
            type="checkbox"
            checked={filters.onlyBlocking}
            onChange={(event) => update({ onlyBlocking: event.target.checked })}
          />
          Solo bloqueantes
        </label>
      </div>

      {items.length === 0 ? (
        <EmptyState
          mascot
          title={view.canCreate ? 'No hay peticiones en tus bandejas' : 'Todavía no perteneces a ningún área'}
          description={
            view.canCreate
              ? 'Aquí verás lo que otras áreas piden a la tuya y lo que la tuya pide a otras. Las dependencias de tus iniciativas también aparecen aquí.'
              : 'Pide a un responsable que te añada a tu área para ver y enviar peticiones.'
          }
          action={
            view.canCreate ? (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus aria-hidden /> Nueva petición
              </Button>
            ) : undefined
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="Nada con estos filtros"
          description={
            filters.tab === 'INCOMING' && !filtersActive
              ? 'Ninguna petición abierta para tu equipo. Buen momento para revisar las salientes.'
              : 'Prueba con otra bandeja o quita algún filtro.'
          }
          action={
            filtersActive ? (
              <Button size="sm" variant="outline" onClick={() => setFilters({ ...DEFAULT_INBOX_FILTERS, tab: filters.tab })}>
                Quitar filtros
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2" aria-label="Peticiones">
          {visible.map((item) => (
            <li key={`${item.kind}:${item.id}`}>
              {item.kind === 'request' ? (
                <RequestCard request={item.request} onOpen={() => setOpenRequestId(item.id)} />
              ) : (
                <InitiativeDependencyCard dependency={item.dependency} />
              )}
            </li>
          ))}
        </ul>
      )}

      {view.closedTruncated && (filters.status === 'CLOSED' || filters.status === 'ALL') ? (
        <p className="text-center text-xs text-fg-muted">
          Se muestran las {MAX_CLOSED_INBOX_ITEMS} cerradas más recientes de cada tipo. Las abiertas aparecen siempre todas.
        </p>
      ) : null}

      {creating ? (
        <NewRequestDialog
          sourceDepartments={view.sourceDepartments}
          targetDepartments={view.targetDepartments}
          initiatives={view.initiatives}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {openRequest ? <RequestDetailDialog request={openRequest} onClose={() => setOpenRequestId(null)} /> : null}
    </div>
  );
}

function RouteLine({ from, to }: { from: Department; to: Department }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <DepartmentChip department={from} />
      <span aria-hidden="true" className="text-fg-subtle">
        →
      </span>
      <span className="sr-only">pide ayuda a</span>
      <DepartmentChip department={to} />
    </span>
  );
}

function RequestCard({ request, onOpen }: { request: DepartmentRequestView; onOpen: () => void }) {
  return (
    <article className="rounded-lg border border-border bg-surface p-3 transition-colors hover:border-border-strong">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <RouteLine from={request.sourceDepartment} to={request.targetDepartment} />
        <div className="flex flex-wrap items-center gap-1.5">
          <RequestStatusBadge status={request.status} />
          <Badge tone="info">{HELP_TYPE_LABELS[request.helpType]}</Badge>
          <RequestBlockingBadge request={request} />
        </div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-2 block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
      >
        <h3 className="text-sm font-medium">{request.title}</h3>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-fg-muted">{request.description}</p>
      </button>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
        <span>
          {request.requestedByName} · <span className="tabular-nums">{formatDateTime(request.createdAt)}</span>
        </span>
        {request.assigneeName ? <span>Atiende: {request.assigneeName}</span> : null}
        {request.attachments.length > 0 ? (
          <span className="inline-flex items-center gap-1" title="Adjuntos">
            <Paperclip className="size-3.5" aria-hidden />
            <span className="tabular-nums">{request.attachments.length}</span>
            <span className="sr-only">adjuntos</span>
          </span>
        ) : null}
        {request.initiativeId ? (
          <Link href={initiativeSheetHref(request.initiativeId)} scroll={false} className="text-accent-text hover:underline">
            {request.initiativeId}
          </Link>
        ) : null}
        <span className="ml-auto flex gap-1.5">
          {request.canResolve ? (
            <Button size="sm" variant={request.canStart ? 'outline' : 'default'} onClick={onOpen}>
              {request.canStart ? 'Atender' : 'Resolver'}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={onOpen}>
              Ver detalle
            </Button>
          )}
        </span>
      </div>
    </article>
  );
}

function InitiativeDependencyCard({ dependency }: { dependency: InitiativeDependencyView }) {
  return (
    <article className="rounded-lg border border-border bg-surface p-3 transition-colors hover:border-border-strong">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <RouteLine from={dependency.ownerDepartment} to={dependency.targetDepartment} />
        <div className="flex flex-wrap items-center gap-1.5">
          <InitiativeDependencyBadge />
          <DependencyStatusBadge status={dependency.status} />
          <Badge tone="info">{HELP_TYPE_LABELS[dependency.helpType]}</Badge>
          {dependency.isBlocking ? <RealBlockingBadge /> : null}
        </div>
      </div>

      <h3 className="mt-2 text-sm font-medium">
        {dependency.initiativeId} · {dependency.initiativeTitle}
      </h3>
      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-fg-muted">{dependency.description}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
        <span>
          {dependency.requestedByName} · <span className="tabular-nums">{formatDateTime(dependency.createdAt)}</span>
        </span>
        <span className="ml-auto">
          <Button size="sm" variant="ghost" asChild>
            <Link href={initiativeSheetHref(dependency.initiativeId)} scroll={false}>
              <ExternalLink aria-hidden />
              Abrir ficha
            </Link>
          </Button>
        </span>
      </div>
    </article>
  );
}
