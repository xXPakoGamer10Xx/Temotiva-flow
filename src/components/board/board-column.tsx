import type { BoardColumnView } from '@/server/services/views';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import { formatDuration } from '@/server/services/sle';
import { Badge } from '@/components/ui/primitives';
import { DEPARTMENT_ACCENT, DepartmentDot } from '@/components/shared/signals';
import { BoardCard } from './board-card';
import { InfoHint } from '@/components/help/info-hint';
import { cn } from '@/lib/utils';

/**
 * Columna de fase: nombre, contador de WIP y permanencia media real.
 * El límite de WIP advierte pero nunca impide mover una iniciativa (D5).
 */
export function BoardColumn({
  column,
  basePath,
  query,
}: {
  column: BoardColumnView;
  basePath: string;
  query?: string;
}) {
  const hidden = column.totalInStage - column.cards.length;

  return (
    <section
      className="relative flex h-full min-h-0 w-[min(18rem,85vw)] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-border"
      aria-label={`Fase ${column.stage.name}`}
    >
      {/* Panel teñido con el color del departamento propietario de la fase. */}
      <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0', DEPARTMENT_ACCENT[column.stage.defaultOwnerDepartment])}>
        <div className="absolute inset-0 bg-current opacity-[0.07]" />
        <div className="h-1 bg-current" />
      </div>

      <header className="relative px-2.5 pb-2 pt-3.5">
        <div className="flex items-baseline gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-medium tracking-tight">
            <DepartmentDot department={column.stage.defaultOwnerDepartment} />
            {column.stage.name}
          </h2>
          <span
            className={cn(
              'font-mono text-xs tabular-nums',
              column.isSaturated ? 'text-[var(--warning)]' : 'text-fg-subtle',
            )}
            title={`${column.wipCount} iniciativas activas frente al cupo recomendado de ${column.wipLimit}`}
          >
            {column.wipCount}/{column.wipLimit}
          </span>
          <InfoHint term="wip" className="-ml-1" />
          {column.isSaturated ? (
            <Badge tone="warning" className="ml-auto">
              <span aria-hidden="true" className="text-[11px] leading-none">
                ⚠️
              </span>
              Saturado +{column.overBy}
            </Badge>
          ) : null}
        </div>

        <div className="mt-1 flex items-center gap-2 text-xs text-fg-subtle">
          <span title="Departamento propietario por defecto de esta fase">
            {DEPARTMENT_LABELS[column.stage.defaultOwnerDepartment]}
          </span>
          <span aria-hidden="true">·</span>
          <span title="Objetivo de permanencia de la fase">
            SLE {formatDuration(column.stage.sleHours * 3600000)}
          </span>
          <InfoHint term="sle" className="-mx-1" />
          {column.totalInStage > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span title="Permanencia neta media real de las iniciativas presentes">
                media {formatDuration(column.averageNetMs)}
              </span>
            </>
          ) : null}
        </div>
      </header>

      <div className="scrollbar-slim relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-2.5">
        {column.cards.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong px-3 py-5 text-center text-xs text-fg-muted">
            {hidden > 0 ? `${hidden} oculta(s) por el filtro` : 'Sin iniciativas'}
          </p>
        ) : (
          <>
            {column.cards.map((card) => (
              <BoardCard key={card.id} card={card} basePath={basePath} query={query} />
            ))}
            {hidden > 0 ? (
              <p className="px-1 text-xs text-fg-subtle">{hidden} más oculta(s) por el filtro</p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
