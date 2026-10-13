import Link from 'next/link';
import type { Route } from 'next';
import { Paperclip } from 'lucide-react';
import type { InitiativeCardView } from '@/server/services/views';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import { Avatar } from '@/components/ui/primitives';
import {
  DependencySatellites,
  DepartmentChip,
  GateProgress,
  OverrideMarkBadge,
  PriorityBadge,
  SleClock,
  StopBanner,
} from '@/components/shared/signals';
import { cn } from '@/lib/utils';

/**
 * Tarjeta del tablero (TemoFlow.md §3.1). Abre la ficha lateral añadiendo
 * `?iniciativa=TEMO-XXX` a la ruta actual, así que funciona igual desde el
 * tablero, el radar o el centro de notificaciones.
 */
export function BoardCard({ card, basePath, query }: { card: InitiativeCardView; basePath: string; query?: string }) {
  const href = `${basePath}?${query ? `${query}&` : ''}iniciativa=${card.id}`;

  // El `relative` de la tarjeta no es decorativo: el texto `sr-only` del final
  // es `position: absolute` y, sin un ancestro posicionado, se ancla al
  // documento entero en vez de a la tarjeta. Al quedar fuera del recorte del
  // tablero, estiraba la página y aparecía una segunda barra de desplazamiento
  // horizontal que solo mostraba fondo vacío.
  return (
    <Link
      href={href as Route}
      scroll={false}
      className={cn(
        // `shrink-0`: la columna es un flex vertical con scroll; sin esto las
        // tarjetas se encogían al llenarse la columna y recortaban el título.
        'card-hover group relative block shrink-0 overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-card)]',
        card.isBlocked && 'border-[color-mix(in_oklch,var(--danger)_35%,var(--border))]',
        card.isArchived && 'opacity-60',
      )}
    >
      {card.isBlocked ? <StopBanner stopReason={card.stopReason} description={card.blockedDescription} /> : null}

      <div className="space-y-2 p-2.5">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <span className="shrink-0 font-mono text-xs text-fg-subtle">{card.id}</span>
          <PriorityBadge priority={card.priority} reason={card.priorityReason} />
        </div>

        <h3 className="text-sm font-medium leading-snug text-fg [overflow-wrap:anywhere] transition-colors group-hover:text-accent-text">
          {card.title}
        </h3>

        {card.currentTask ? (
          <p className="text-xs leading-relaxed text-fg-muted [overflow-wrap:anywhere]">{card.currentTask}</p>
        ) : null}

        {card.dependencies.length > 0 || card.lastOverride || card.skippedStageCount > 0 || card.attachmentCount > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            <DependencySatellites dependencies={card.dependencies} />
            {card.lastOverride ? <OverrideMarkBadge /> : null}
            {card.attachmentCount > 0 ? (
              <span
                className="tone-neutral inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs tabular-nums"
                title="Documentos adjuntos"
              >
                <Paperclip className="size-3.5" aria-hidden />
                {card.attachmentCount}
              </span>
            ) : null}
            {card.skippedStageCount > 0 ? (
              <span className="tone-neutral rounded-md px-1.5 py-0.5 text-xs tabular-nums" title="Fases marcadas como No aplica">
                Ruta {7 - card.skippedStageCount}/7
              </span>
            ) : null}
          </div>
        ) : null}

        <GateProgress completed={card.gate.completed} total={card.gate.total} />

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <SleClock reading={card.sle} />
          <span className="flex items-center gap-1.5">
            <DepartmentChip department={card.ownerDepartment} short className="text-xs" />
            {card.assignee ? <Avatar name={card.assignee.name} /> : null}
          </span>
        </div>
      </div>

      <span className="sr-only">
        Abrir la ficha de {card.id}, propiedad de {DEPARTMENT_LABELS[card.ownerDepartment]}
      </span>
    </Link>
  );
}
