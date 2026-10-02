import type { ActionType } from '@/domain/enums';
import { ACTION_TYPE_LABELS } from '@/domain/labels';
import type { InitiativeDetailView } from '@/server/services/views';
import { Badge } from '@/components/ui/primitives';
import { Avatar } from '@/components/ui/primitives';
import { formatDateTime } from '@/lib/utils';

/**
 * Pestaña Trazabilidad: la caja negra en orden cronológico inverso.
 * Solo lectura, siempre: el log es append-only (SEGURIDAD.md §6).
 */

const TONE_BY_ACTION: Partial<Record<ActionType, 'danger' | 'warning' | 'success' | 'info' | 'accent'>> = {
  EXCEPTION_OVERRIDE: 'danger',
  BLOCKED_SET: 'danger',
  BLOCKED_CLEARED: 'success',
  STAGE_TRANSITION: 'accent',
  DEPENDENCY_CREATED: 'info',
  DEPENDENCY_RESOLVED: 'success',
  DEPENDENCY_REJECTED: 'warning',
  INITIATIVE_ARCHIVED: 'warning',
};

export function AuditTab({ detail }: { detail: InitiativeDetailView }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-fg-muted">
        Registro inmutable de todo lo ocurrido en la vida de la iniciativa. No se edita ni se borra.
      </p>

      <ol className="relative space-y-3 border-l border-border pl-5">
        {detail.audit.map((entry) => (
          <li key={entry.id} className="relative">
            <span
              className="absolute -left-[1.4rem] top-1.5 size-2 rounded-full bg-border ring-4 ring-surface"
              aria-hidden="true"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TONE_BY_ACTION[entry.actionType] ?? 'neutral'}>
                {ACTION_TYPE_LABELS[entry.actionType]}
              </Badge>
              {entry.fromStageName && entry.toStageName ? (
                <span className="text-[11px] text-fg-muted">
                  {entry.fromStageName} ➔ {entry.toStageName}
                </span>
              ) : null}
              <span className="ml-auto text-[11px] text-fg-muted">{formatDateTime(entry.createdAt)}</span>
            </div>

            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-fg-muted">
              {entry.actor ? <Avatar name={entry.actor.name} className="size-4 text-[8px]" /> : null}
              <span>{entry.actor?.name ?? 'Sistema'}</span>
            </div>

            {entry.detail ? <p className="mt-1 text-xs leading-relaxed">{entry.detail}</p> : null}

            {entry.overrideMetadata ? (
              <dl className="mt-2 space-y-1 rounded-md border border-border tone-warning px-3 py-2 text-[11px] text-[var(--warning)]">
                <div>
                  <dt className="inline font-semibold">Pendiente: </dt>
                  <dd className="inline">
                    {entry.overrideMetadata.pendingItems.map((item) => item.label).join(' · ')}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Autorizado por: </dt>
                  <dd className="inline">
                    {entry.overrideMetadata.authorizedBy} ({entry.overrideMetadata.authorizedByRole})
                  </dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Motivo: </dt>
                  <dd className="inline">{entry.overrideMetadata.reason}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Riesgo asumido: </dt>
                  <dd className="inline">{entry.overrideMetadata.riskAccepted}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Origen: </dt>
                  <dd className="inline font-mono">
                    {entry.overrideMetadata.ip ?? 'IP no registrada'}
                    {entry.overrideMetadata.userAgent ? ` · ${entry.overrideMetadata.userAgent.slice(0, 60)}` : ''}
                  </dd>
                </div>
              </dl>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
