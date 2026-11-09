import type { ActionType } from '@/domain/enums';
import type { ActivityLogEntry, JsonValue, OverrideMetadata, SessionContext } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { emitAuditAppended } from './audit-listeners';

/**
 * Caja negra: única puerta de escritura de eventos (SEGURIDAD.md §6).
 *
 * El `user_id` sale siempre de la sesión criptográficamente validada y nunca de
 * un parámetro del cliente: eso es lo que sostiene el no repudio de las firmas
 * de excepción.
 */
export interface AuditInput {
  initiativeId: string | null;
  session: SessionContext;
  actionType: ActionType;
  fromStageId?: number | null;
  toStageId?: number | null;
  fieldName?: string | null;
  oldValue?: JsonValue | null;
  newValue?: JsonValue | null;
  overrideMetadata?: OverrideMetadata | null;
  at?: Date;
}

export async function audit(store: DataStore, input: AuditInput): Promise<ActivityLogEntry> {
  const entry = await store.appendActivityLog({
    initiativeId: input.initiativeId,
    userId: input.session.userId,
    actionType: input.actionType,
    fromStageId: input.fromStageId ?? null,
    toStageId: input.toStageId ?? null,
    fieldName: input.fieldName ?? null,
    oldValue: input.oldValue ?? null,
    newValue: input.newValue ?? null,
    overrideMetadata: input.overrideMetadata ?? null,
    createdAt: (input.at ?? new Date()).toISOString(),
  });
  emitAuditAppended(store, entry); // spec 002 §9: avisa de la entrada ya guardada; nunca lanza.
  return entry;
}
