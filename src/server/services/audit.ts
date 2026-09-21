import type { ActionType } from '@/domain/enums';
import type { ActivityLogEntry, JsonValue, OverrideMetadata, SessionContext } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';

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

export function audit(store: DataStore, input: AuditInput): Promise<ActivityLogEntry> {
  return store.appendActivityLog({
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
}
