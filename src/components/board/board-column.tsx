import type { BoardColumnView } from '@/server/services/views';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import { formatDuration } from '@/server/services/sle';
import { Badge } from '@/components/ui/primitives';
import { BoardCard } from './board-card';
import { cn } from '@/lib/utils';

/**
 * Columna de fase: nombre, contador de WIP y permanencia media real.
 * El límite de WIP advierte pero nunca impide mover una iniciativa (D5).
 */
export function BoardColumn({ column, basePath }: { column: BoardColumnView; basePath: string }) {
  return (
    <section className="flex w-[19.5rem] shrink-0 flex-col gap-3" aria-label={`Fase ${column.stage.name}`}>
      <header
        className={cn(
          'rounded-lg border border-border bg-card px-3 py-2.5',
          column.isSaturated && 'border-warning/45 bg-warning-soft',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">{column.stage.name}</h2>
          <span
            className={cn(
              'font-mono text-xs tabular-nums',
              column.isSaturated ? 'font-semibold text-warning' : 'text-muted-foreground',
            )}
            title="Iniciativas activas frente al cupo recomendado"
          >
            {column.wipCount}/{column.wipLimit}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span title="Departamento propietario por defecto de esta fase">
            {DEPARTMENT_LABELS[column.stage.defaultOwnerDepartment]}
          </span>
          <span title="Objetivo de permanencia de la fase">SLE {formatDuration(column.stage.sleHours * 3600000)}</span>
          <span title="Permanencia neta media real de las iniciativas presentes">
            Media {column.cards.length ? formatDuration(column.averageNetMs) : '—'}
          </span>
        </div>

        {column.isSaturated ? (
          <Badge tone="warning" className="mt-2">
            <span aria-hidden="true">⚠️</span>
            Saturado (+{column.overBy})
          </Badge>
        ) : null}
      </header>

      <div className="flex flex-col gap-2.5">
        {column.cards.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[11px] text-muted-foreground">
            Sin iniciativas en esta fase
          </p>
        ) : (
          column.cards.map((card) => <BoardCard key={card.id} card={card} basePath={basePath} />)
        )}
      </div>
    </section>
  );
}
