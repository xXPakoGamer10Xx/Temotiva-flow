import type { BoardColumnView } from '@/server/services/views';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import { formatDuration } from '@/server/services/sle';
import { Badge } from '@/components/ui/primitives';
import { DepartmentDot } from '@/components/shared/signals';
import { BoardCard } from './board-card';
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
    <section className="flex w-[17.5rem] shrink-0 flex-col" aria-label={`Fase ${column.stage.name}`}>
      <header className="sticky top-0 z-10 bg-bg pb-2 pt-1">
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

      <div className="flex flex-col gap-2">
        {column.cards.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-fg-subtle">
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
