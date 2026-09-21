import Link from 'next/link';
import type { Route } from 'next';
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
 * Tarjeta del tablero (TemoFlow.md §3.1). Abre la ficha 360° añadiendo
 * `?iniciativa=TEMO-XXX` a la ruta actual, así que funciona igual desde el
 * tablero, el radar o el centro de notificaciones.
 */
export function BoardCard({ card, basePath }: { card: InitiativeCardView; basePath: string }) {
  return (
    <Link
      href={`${basePath}?iniciativa=${card.id}` as Route}
      scroll={false}
      className={cn(
        'group block rounded-lg border border-border bg-card transition-all hover:border-primary/45 hover:shadow-sm',
        card.isBlocked && 'border-danger/35',
        card.isArchived && 'opacity-60',
      )}
    >
      {card.isBlocked ? <StopBanner stopReason={card.stopReason} description={card.blockedDescription} /> : null}

      <div className="space-y-2.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-[11px] font-semibold text-muted-foreground">{card.id}</span>
          <PriorityBadge priority={card.priority} reason={card.priorityReason} />
        </div>

        <h3 className="text-sm font-medium leading-snug text-foreground group-hover:text-primary">{card.title}</h3>

        {card.currentTask ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">En curso: {card.currentTask}</p>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <DepartmentChip department={card.ownerDepartment} short />
          {card.assignee ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Avatar name={card.assignee.name} className="size-5" />
              <span className="hidden sm:inline">{card.assignee.name.split(' ')[0]}</span>
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">Sin asignar</span>
          )}
        </div>

        <SleClock reading={card.sle} />

        <DependencySatellites dependencies={card.dependencies} />

        {card.lastOverride ? <OverrideMarkBadge /> : null}

        <GateProgress completed={card.gate.completed} total={card.gate.total} />
      </div>

      <span className="sr-only">
        Abrir la ficha de {card.id}, propiedad de {DEPARTMENT_LABELS[card.ownerDepartment]}
      </span>
    </Link>
  );
}
