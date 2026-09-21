import type { HelpType, StopReason } from '@/domain/enums';
import type { Initiative, SessionContext } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { invalidState, notFound } from './errors';

/**
 * Estado de parada (TemoFlow.md §1.1.C, DESIGN.md §7.4).
 *
 * Una dependencia no implica parada: solo la marcada como bloqueante detiene el
 * trabajo. El tiempo en parada se consolida en `blockedMsInStage` para que el
 * reloj de SLE sea neto.
 */

/** Causa de parada por defecto según el tipo de ayuda solicitada. */
export const STOP_REASON_BY_HELP_TYPE: Record<HelpType, StopReason> = {
  DECISION: 'ESPERANDO_DECISION',
  VALIDATION: 'ESPERANDO_VALIDACION',
  REVIEW: 'ESPERANDO_VALIDACION',
  INFORMATION: 'ESPERANDO_INFORMACION',
  RESOURCE: 'BLOQUEO_TECNICO',
  UNBLOCK: 'BLOQUEO_TECNICO',
};

export async function loadInitiative(store: DataStore, initiativeId: string): Promise<Initiative> {
  const initiative = await store.initiativeById(initiativeId);
  if (!initiative) throw notFound(`No existe la iniciativa ${initiativeId}.`);
  return initiative;
}

/** Suma al acumulado el tramo de parada abierto y lo cierra. */
export function consolidateBlockedTime(initiative: Initiative, now: Date): number {
  if (!initiative.isBlocked || !initiative.blockedSince) return initiative.blockedMsInStage;
  const openBlock = now.getTime() - new Date(initiative.blockedSince).getTime();
  return initiative.blockedMsInStage + Math.max(0, openBlock);
}

export interface SetBlockedInput {
  initiativeId: string;
  stopReason: StopReason;
  description: string;
  /** Dependencia que provocó la parada, si la hubo. */
  dependencyId?: string;
  now?: Date;
}

export async function setBlocked(
  store: DataStore,
  session: SessionContext,
  input: SetBlockedInput,
): Promise<Initiative> {
  const now = input.now ?? new Date();
  const initiative = await loadInitiative(store, input.initiativeId);
  if (initiative.isArchived) throw invalidState('La iniciativa está archivada.');

  const updated = await store.updateInitiative(initiative.id, {
    isBlocked: true,
    stopReason: input.stopReason,
    blockedDescription: input.description,
    // Si ya estaba en parada se conserva el inicio original: no se reinicia el reloj.
    blockedSince: initiative.isBlocked && initiative.blockedSince ? initiative.blockedSince : now.toISOString(),
    updatedAt: now.toISOString(),
  });

  await audit(store, {
    initiativeId: initiative.id,
    session,
    actionType: 'BLOCKED_SET',
    fieldName: 'is_blocked',
    oldValue: { isBlocked: initiative.isBlocked, stopReason: initiative.stopReason },
    newValue: {
      isBlocked: true,
      stopReason: input.stopReason,
      description: input.description,
      ...(input.dependencyId ? { dependencyId: input.dependencyId } : {}),
    },
    at: now,
  });

  return updated;
}

export interface ClearBlockedInput {
  initiativeId: string;
  /** Texto de contexto: quién o qué levantó la parada. */
  note?: string;
  dependencyId?: string;
  automatic?: boolean;
  now?: Date;
}

export async function clearBlocked(
  store: DataStore,
  session: SessionContext,
  input: ClearBlockedInput,
): Promise<Initiative> {
  const now = input.now ?? new Date();
  const initiative = await loadInitiative(store, input.initiativeId);
  if (!initiative.isBlocked) return initiative;

  const blockedMsInStage = consolidateBlockedTime(initiative, now);

  const updated = await store.updateInitiative(initiative.id, {
    isBlocked: false,
    stopReason: null,
    blockedDescription: null,
    blockedSince: null,
    blockedMsInStage,
    updatedAt: now.toISOString(),
  });

  await audit(store, {
    initiativeId: initiative.id,
    session,
    actionType: 'BLOCKED_CLEARED',
    fieldName: 'is_blocked',
    oldValue: { isBlocked: true, stopReason: initiative.stopReason },
    newValue: {
      isBlocked: false,
      blockedMsInStage,
      automatic: input.automatic ?? false,
      ...(input.note ? { note: input.note } : {}),
      ...(input.dependencyId ? { dependencyId: input.dependencyId } : {}),
    },
    at: now,
  });

  return updated;
}

/**
 * Regla automática: al resolverse la última dependencia bloqueante pendiente,
 * la parada se levanta sola (TemoFlow.md §4.2.2).
 */
export async function refreshBlockFromDependencies(
  store: DataStore,
  session: SessionContext,
  initiativeId: string,
  options: { dependencyId?: string; now?: Date } = {},
): Promise<Initiative> {
  const now = options.now ?? new Date();
  const initiative = await loadInitiative(store, initiativeId);
  if (!initiative.isBlocked) return initiative;

  const dependencies = await store.listDependencies(initiativeId);
  const stillBlocking = dependencies.some((dependency) => dependency.isBlocking && dependency.status === 'PENDING');
  if (stillBlocking) return initiative;

  return clearBlocked(store, session, {
    initiativeId,
    automatic: true,
    dependencyId: options.dependencyId,
    note: 'Parada levantada automáticamente al resolverse la última dependencia bloqueante.',
    now,
  });
}
