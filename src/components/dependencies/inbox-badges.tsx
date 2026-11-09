import type { HelpStatus } from '@/domain/enums';
import type { DepartmentRequestStatus } from '@/domain/department-request';
import { DEPARTMENT_REQUEST_STATUS_LABELS, HELP_STATUS_LABELS, INITIATIVE_DEPENDENCY_BADGE } from '@/domain/labels';
import type { DepartmentRequestView } from '@/server/services/department-requests';
import { Badge } from '@/components/ui/primitives';
import { requestBlockingLabel } from './inbox-model';

/**
 * Insignias del buzón. El estado nunca se transmite solo por color: cada una
 * lleva su texto, y los emoji fijados por la spec van con `aria-hidden`.
 */

const REQUEST_STATUS_TONE = {
  PENDING: 'warning',
  IN_PROGRESS: 'info',
  RESOLVED: 'success',
} as const satisfies Record<DepartmentRequestStatus, 'warning' | 'info' | 'success'>;

const HELP_STATUS_TONE = {
  PENDING: 'warning',
  RESOLVED: 'success',
  REJECTED: 'neutral',
} as const satisfies Record<HelpStatus, 'warning' | 'success' | 'neutral'>;

export function RequestStatusBadge({ status }: { status: DepartmentRequestStatus }) {
  return <Badge tone={REQUEST_STATUS_TONE[status]}>{DEPARTMENT_REQUEST_STATUS_LABELS[status]}</Badge>;
}

export function DependencyStatusBadge({ status }: { status: HelpStatus }) {
  return <Badge tone={HELP_STATUS_TONE[status]}>{HELP_STATUS_LABELS[status]}</Badge>;
}

/** Indicador informativo de una petición (RF-9): aviso, no parada. */
export function RequestBlockingBadge({
  request,
}: {
  request: Pick<DepartmentRequestView, 'blocksInitiative' | 'initiativeId'>;
}) {
  const label = requestBlockingLabel(request);
  if (!label) return null;
  return (
    <Badge tone="warning">
      {request.initiativeId ? <span aria-hidden="true">⚠️</span> : null}
      {label}
    </Badge>
  );
}

/** Dependencia 🆘 de iniciativa: esta sí cuenta para el SLE (RF-16). */
export function InitiativeDependencyBadge() {
  return (
    <Badge tone="accent">
      <span aria-hidden="true">🔗</span>
      {INITIATIVE_DEPENDENCY_BADGE}
    </Badge>
  );
}

/** Bloqueo real de una dependencia de iniciativa: detiene el trabajo y el reloj. */
export function RealBlockingBadge() {
  return (
    <Badge tone="danger">
      <span aria-hidden="true">⛔</span>
      Bloqueante
    </Badge>
  );
}
