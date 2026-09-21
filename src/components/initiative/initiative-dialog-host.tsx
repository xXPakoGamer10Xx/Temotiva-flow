import type { SessionContext } from '@/domain/types';
import { getDataStore } from '@/server/repositories';
import { canArchiveInitiative, canOverrideGate } from '@/server/services/rbac';
import { getInitiativeDetail } from '@/server/services/views';
import { InitiativeDialog } from './initiative-dialog';

/**
 * Puente entre la URL y la ficha: cualquier vista que reciba
 * `?iniciativa=TEMO-XXX` monta aquí el modal ya resuelto en el servidor,
 * incluidas las capacidades del rol que mira.
 */
export async function InitiativeDialogHost({
  initiativeId,
  session,
}: {
  initiativeId?: string;
  session: SessionContext;
}) {
  if (!initiativeId) return null;

  const store = getDataStore();
  const initiative = await store.initiativeById(initiativeId);
  if (!initiative) return null;

  const detail = await getInitiativeDetail(store, initiativeId);

  return (
    <InitiativeDialog
      detail={detail}
      session={session}
      capabilities={{
        canOverride: canOverrideGate(session, initiative),
        // El servidor comprueba además que sea LEAD del área actual o destino.
        canReassign: session.role !== 'MEMBER',
        canArchive: canArchiveInitiative(session, initiative),
      }}
    />
  );
}
