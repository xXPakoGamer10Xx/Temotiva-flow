import { ChevronRight } from 'lucide-react';
import { TSHIRT_SIZE_LABELS } from '@/domain/labels';
import type { InitiativeDetailView, StageHistoryView } from '@/server/services/views';
import { Badge, SectionLabel } from '@/components/ui/primitives';
import { formatDateTime } from '@/lib/utils';
import { SignoffSummary } from './signoff-panel';

/**
 * Pestaña Historial (spec 005 §5.7): un bloque desplegable por fase cerrada.
 * Solo el último cierre arranca abierto; el resto, plegado, ocupa una línea.
 * `<details>` nativo: accesible por teclado y sin JavaScript de cliente.
 */
export function HistoryTab({ detail }: { detail: InitiativeDetailView }) {
  const { history } = detail;

  if (history.length === 0) {
    return (
      <p className="text-xs text-fg-subtle">
        Todavía no se ha cerrado ninguna fase. Cada avance dejará aquí su nota, quién lo registró y las aprobaciones de
        cada área.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>Fases cerradas</SectionLabel>
        {detail.tshirtSize ? <Badge tone="info">T-shirt {TSHIRT_SIZE_LABELS[detail.tshirtSize]}</Badge> : null}
      </div>
      <ol className="space-y-1.5">
        {history.map((block, index) => (
          <li key={block.key}>
            <HistoryBlock block={block} defaultOpen={index === history.length - 1} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function HistoryBlock({ block, defaultOpen }: { block: StageHistoryView; defaultOpen: boolean }) {
  const approved = block.signoffs.filter((signoff) => signoff.isApproved).length;

  return (
    <details open={defaultOpen} className="group rounded-lg border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
        <ChevronRight className="size-3.5 shrink-0 text-fg-subtle transition-transform group-open:rotate-90" />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-fg">{block.stageName}</span>
          <span className="text-fg-subtle">
            {' · '}
            {formatDateTime(block.closedAt)}
            {block.closedBy ? ` · ${block.kind === 'FINALIZED' ? 'Finalizó' : 'Avanzó'}: ${block.closedBy.name}` : ''}
          </span>
        </span>
        {block.isOverride ? (
          <Badge tone="warning" className="shrink-0">
            <span aria-hidden="true">⚠️</span> Excepcional
          </Badge>
        ) : null}
        {block.tshirtSize ? (
          <Badge tone="info" className="shrink-0">
            T-shirt {TSHIRT_SIZE_LABELS[block.tshirtSize]}
          </Badge>
        ) : null}
        {block.signoffs.length > 0 ? (
          <Badge tone={approved === block.signoffs.length ? 'success' : 'neutral'} className="shrink-0 tabular-nums">
            {approved}/{block.signoffs.length} áreas
          </Badge>
        ) : null}
      </summary>

      <div className="space-y-3 border-t border-border px-3 py-2.5">
        <div className="space-y-1">
          <SectionLabel>{block.kind === 'FINALIZED' ? 'Nota de cierre' : 'Nota de avance'}</SectionLabel>
          {block.note ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-fg">{block.note}</p>
          ) : (
            <p className="text-xs text-fg-subtle">Avance anterior a la nota obligatoria: no se registró nota.</p>
          )}
          <p className="text-xs text-fg-subtle">
            {block.kind === 'FINALIZED' ? 'Iniciativa finalizada' : `Pasó a ${block.toStageName ?? '—'}`}
            {block.skippedStageNames.length > 0 ? ` · omitió ${block.skippedStageNames.join(', ')}` : ''}
          </p>
        </div>

        {block.signoffs.length > 0 ? (
          <div className="space-y-1">
            <SectionLabel>Aprobaciones de área</SectionLabel>
            <ul className="divide-y divide-border rounded-md border border-border">
              {block.signoffs.map((signoff) => (
                <li key={signoff.id} className="px-2.5 py-2">
                  <SignoffSummary signoff={signoff} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {block.customChecks.length > 0 ? (
          <div className="space-y-1">
            <SectionLabel>Casillas adicionales</SectionLabel>
            <ul className="space-y-1">
              {block.customChecks.map((check) => (
                <li key={check.id} className="text-xs text-fg-muted">
                  <span aria-hidden="true">{check.isCompleted ? '✅' : '☐'}</span> {check.label}
                  {check.note ? <span className="text-fg-subtle"> · {check.note}</span> : null}
                  {check.isCompleted && check.completedBy ? (
                    <span className="text-fg-subtle"> · {check.completedBy.name}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}
