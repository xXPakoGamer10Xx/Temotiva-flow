'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Route } from 'next';
import type { SessionContext } from '@/domain/types';
import type { InitiativeDetailView } from '@/server/services/views';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/primitives';
import { PriorityBadge, SleClock, StopBanner } from '@/components/shared/signals';
import { GeneralTab } from './general-tab';
import { GateTab } from './gate-tab';
import { DependenciesTab } from './dependencies-tab';
import { AuditTab } from './audit-tab';
import { BlockControl } from './block-control';

export interface InitiativeCapabilities {
  canOverride: boolean;
  canReassign: boolean;
  canArchive: boolean;
}

/**
 * Vista 3 — Ficha 360° (TemoFlow.md §3.3).
 *
 * Se abre desde cualquier vista con `?iniciativa=TEMO-XXX`; al cerrarse se
 * limpia el parámetro, así que la URL siempre es compartible.
 */
export function InitiativeDialog({
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
  const { card } = detail;

  const close = (open: boolean): void => {
    if (!open) router.push(pathname as Route, { scroll: false });
  };

  return (
    <Dialog open onOpenChange={close}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader className="space-y-3 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-muted-foreground">{card.id}</span>
            <PriorityBadge priority={card.priority} reason={card.priorityReason} />
            <Badge tone="primary">{detail.stage.name}</Badge>
            <Badge tone="neutral">{DEPARTMENT_LABELS[card.ownerDepartment]}</Badge>
            {card.isArchived ? <Badge tone="neutral">Archivada</Badge> : null}
          </div>

          <DialogTitle className="text-lg leading-snug">{card.title}</DialogTitle>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <SleClock reading={card.sle} />
            <BlockControl
              initiativeId={card.id}
              isBlocked={card.isBlocked}
              stopReason={card.stopReason}
              disabled={card.isArchived}
            />
          </div>
        </DialogHeader>

        {card.isBlocked ? (
          <StopBanner stopReason={card.stopReason} description={card.blockedDescription} className="rounded-none" />
        ) : null}

        {card.lastOverride ? (
          <div className="border-b border-warning/30 bg-warning-soft px-6 py-3 text-xs text-warning">
            <p className="font-semibold">⚠️ AVANCE EXCEPCIONAL REGISTRADO</p>
            <p className="mt-1">
              <span className="font-medium">Fase:</span> {card.lastOverride.fromStageName} ➔{' '}
              {card.lastOverride.toStageName} · <span className="font-medium">Autorizado por:</span>{' '}
              {card.lastOverride.authorizedBy}
            </p>
            <p className="mt-0.5">
              <span className="font-medium">Pendiente:</span> {card.lastOverride.pendingLabels.join(' · ')}
            </p>
          </div>
        ) : null}

        <DialogBody>
          <Tabs defaultValue="general">
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="gate">
                Compuerta de salida
                <Badge tone={detail.gate.isComplete ? 'success' : 'neutral'}>
                  {detail.gate.completed}/{detail.gate.total}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="dependencies">
                Dependencias
                {card.pendingCount > 0 ? <Badge tone="info">{card.pendingCount}</Badge> : null}
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
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
