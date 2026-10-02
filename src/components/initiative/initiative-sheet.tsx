'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import type { SessionContext } from '@/domain/types';
import type { InitiativeDetailView } from '@/server/services/views';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import { Sheet, SheetBody, SheetCloseButton, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/primitives';
import { PriorityBadge, SleClock, StopBanner } from '@/components/shared/signals';
import { formatDateTime } from '@/lib/utils';
import { GeneralTab } from './general-tab';
import { GateTab } from './gate-tab';
import { DependenciesTab } from './dependencies-tab';
import { AuditTab } from './audit-tab';
import { BlockControl } from './block-control';

export interface InitiativeCapabilities {
  canOverride: boolean;
  canReassign: boolean;
  canArchive: boolean;
  /** Pertenece al área propietaria (o es Dirección): puede mover el trabajo. */
  canAdvance: boolean;
  canAssign: boolean;
  canBlock: boolean;
  canChangePriority: boolean;
  /** Área propietaria, para explicar en la interfaz por qué algo está vedado. */
  ownerLabel: string;
}

/**
 * Vista 3 — Ficha 360° (TemoFlow.md §3.3), como panel lateral.
 *
 * Se abre desde cualquier vista con `?iniciativa=TEMO-XXX` y al cerrarse
 * conserva el resto de la consulta, así que vuelves al tablero con los mismos
 * filtros con los que lo dejaste.
 */
export function InitiativeSheet({
  detail,
  session,
  capabilities,
}: {
  detail: InitiativeDetailView;
  session: SessionContext;
  capabilities: InitiativeCapabilities;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { card } = detail;

  const close = (open: boolean): void => {
    if (open) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete('iniciativa');
    const queryString = next.toString();
    router.push((queryString ? `${pathname}?${queryString}` : pathname) as Route, { scroll: false });
  };

  return (
    <Sheet open onOpenChange={close}>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-fg-subtle">{card.id}</span>
            <PriorityBadge priority={card.priority} reason={card.priorityReason} />
            <Badge tone="accent">{detail.stage.name}</Badge>
            <Badge tone="neutral">{DEPARTMENT_LABELS[card.ownerDepartment]}</Badge>
            {card.isArchived ? <Badge tone="neutral">Archivada</Badge> : null}
            <SheetCloseButton className="ml-auto" />
          </div>

          <SheetTitle>{card.title}</SheetTitle>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <SleClock reading={card.sle} />
              <span className="text-xs text-fg-subtle">
                {card.isBlocked && card.blockedStartedAt
                  ? `En parada desde ${formatDateTime(card.blockedStartedAt)}`
                  : `En ${detail.stage.name} desde ${formatDateTime(detail.stageEnteredAt)}`}
              </span>
            </div>
            <BlockControl
              initiativeId={card.id}
              isBlocked={card.isBlocked}
              stopReason={card.stopReason}
              disabled={card.isArchived}
              canBlock={capabilities.canBlock}
              ownerLabel={capabilities.ownerLabel}
            />
          </div>
        </SheetHeader>

        {card.isBlocked ? (
          <StopBanner
            stopReason={card.stopReason}
            description={card.blockedDescription}
            className="border-b border-border px-5 py-2.5"
          />
        ) : null}

        {card.lastOverride ? (
          <div className="tone-warning border-b border-border px-5 py-2.5 text-xs leading-relaxed">
            <p className="font-medium">
              <span aria-hidden="true">⚠️</span> AVANCE EXCEPCIONAL REGISTRADO
            </p>
            <p className="mt-1 opacity-90">
              {card.lastOverride.fromStageName} ➔ {card.lastOverride.toStageName} · autorizado por{' '}
              {card.lastOverride.authorizedBy} · pendiente: {card.lastOverride.pendingLabels.join(' · ')}
            </p>
          </div>
        ) : null}

        <SheetBody className="pt-4">
          <Tabs defaultValue="general">
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="gate">
                Compuerta
                <Badge tone={detail.gate.isComplete ? 'success' : 'neutral'} className="tabular-nums">
                  {detail.gate.completed}/{detail.gate.total}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="dependencies">
                Dependencias
                <span aria-hidden="true" className="text-[11px] leading-none">
                  🆘
                </span>
                {card.pendingCount > 0 ? (
                  <Badge tone="info" className="tabular-nums">
                    {card.pendingCount}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="audit">Trazabilidad</TabsTrigger>
            </TabsList>

            <TabsContent value="general">
              <GeneralTab detail={detail} capabilities={capabilities} />
            </TabsContent>

            <TabsContent value="gate">
              <GateTab detail={detail} session={session} capabilities={capabilities} />
            </TabsContent>

            <TabsContent value="dependencies">
              <DependenciesTab detail={detail} session={session} />
            </TabsContent>

            <TabsContent value="audit">
              <AuditTab detail={detail} />
            </TabsContent>
          </Tabs>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
