import type { SessionContext } from '@/domain/types';
import { getDataStore } from '@/server/repositories';
import {
  canAdvanceInitiative,
  canArchiveInitiative,
  canAssignInitiative,
  canBlockInitiative,
  canChangePriority,
  canOverrideGate,
} from '@/server/services/rbac';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import { getInitiativeDetail } from '@/server/services/views';
import { InitiativeSheet } from './initiative-sheet';
import { MissingInitiativeNotice } from './missing-initiative-notice';

/**
 * Puente entre la URL y la ficha: cualquier vista que reciba
 * `?iniciativa=TEMO-XXX` monta aquí el panel lateral ya resuelto en el
 * servidor, incluidas las capacidades del rol que mira.
 */
export async function InitiativeSheetHost({
  initiativeId,
  session,
}: {
  initiativeId?: string;
  session: SessionContext;
}) {
  if (!initiativeId) return null;

  const store = getDataStore();
  const initiative = await store.initiativeById(initiativeId);
  if (!initiative) return <MissingInitiativeNotice initiativeId={initiativeId.slice(0, 24)} />;

  const detail = await getInitiativeDetail(store, initiativeId);

  return (
    <InitiativeSheet
      detail={detail}
      session={session}
      capabilities={{
        canOverride: canOverrideGate(session, initiative),
        // El servidor comprueba además que sea LEAD del área actual o destino.
        canReassign: session.role !== 'MEMBER',
        canArchive: canArchiveInitiative(session, initiative),
        canAdvance: canAdvanceInitiative(session, initiative),
        canAssign: canAssignInitiative(session, initiative),
        canBlock: canBlockInitiative(session, initiative),
        canChangePriority: canChangePriority(session, initiative),
        ownerLabel: DEPARTMENT_LABELS[initiative.ownerDepartment],
      }}
    />
  );
}
