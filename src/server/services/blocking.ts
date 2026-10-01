import type { HelpType, StopReason } from '@/domain/enums';
import type { Dependency, Initiative, SessionContext } from '@/domain/types';
import { DEPARTMENT_LABELS, HELP_TYPE_LABELS } from '@/domain/labels';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { invalidState, notFound } from './errors';
import { assertPermission, canBlockInitiative } from './rbac';

/**
 * Estado de parada (TemoFlow.md §1.1.C, DESIGN.md §7.4).
 *
 * Una dependencia no implica parada: solo la marcada como bloqueante detiene el
 * trabajo. El tiempo en parada se consolida en `blockedMsInStage` para que el
 * reloj de SLE sea neto.
 *
 * La parada tiene **dos orígenes que pueden coexistir**: la declarada a mano y
 * la inducida por dependencias bloqueantes pendientes. El estado efectivo se
 * recalcula siempre a partir de ambos (`recomputeBlockState`), de modo que
 * resolver la última dependencia no levanta una parada manual que sigue viva, y
 * abrir la segunda dependencia bloqueante no vuelve a registrar una parada que
 * ya estaba abierta.
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

interface BlockCause {
  reason: StopReason;
  description: string;
  dependencyId?: string;
}

/** La causa efectiva: manda la manual y, si no la hay, la dependencia bloqueante más antigua. */
function effectiveCause(initiative: Initiative, blockingDependencies: Dependency[]): BlockCause | null {
  if (initiative.manualStopReason) {
    return {
      reason: initiative.manualStopReason,
      description: initiative.manualStopDescription ?? '',
    };
  }

  const oldest = blockingDependencies
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(0);
  if (!oldest) return null;

  return {
    reason: STOP_REASON_BY_HELP_TYPE[oldest.helpType],
    description: `${DEPARTMENT_LABELS[oldest.targetDepartment]} · ${HELP_TYPE_LABELS[oldest.helpType]}: ${oldest.description}`,
    dependencyId: oldest.id,
  };
}

interface RecomputeOptions {
  now?: Date;
  /** Contexto del evento que disparó el recálculo, para el registro. */
  trigger?: { dependencyId?: string; automatic?: boolean; note?: string };
}

/**
 * Recalcula el estado de parada a partir de sus dos orígenes y registra el
 * evento **solo cuando el estado cambia de verdad**.
 *
 * Es la única función que escribe `isBlocked`: así no hay forma de que dos
 * caminos distintos dejen el flag y sus causas descuadrados.
 */
export async function recomputeBlockState(
  store: DataStore,
  session: SessionContext,
  initiativeId: string,
  options: RecomputeOptions = {},
): Promise<Initiative> {
  const now = options.now ?? new Date();
  const initiative = await loadInitiative(store, initiativeId);

  const dependencies = await store.listDependencies(initiativeId);
  const blocking = dependencies.filter((dependency) => dependency.isBlocking && dependency.status === 'PENDING');
  const cause = effectiveCause(initiative, blocking);
  const shouldBlock = cause !== null;

  // --- Entra en parada -------------------------------------------------------
  if (shouldBlock && !initiative.isBlocked) {
    const updated = await store.updateInitiative(initiative.id, {
      isBlocked: true,
      stopReason: cause.reason,
      blockedDescription: cause.description,
      blockedSince: now.toISOString(),
      blockedStartedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    await audit(store, {
      initiativeId: initiative.id,
      session,
      actionType: 'BLOCKED_SET',
      fieldName: 'is_blocked',
      oldValue: { isBlocked: false },
      newValue: {
        isBlocked: true,
        stopReason: cause.reason,
        description: cause.description,
        origin: initiative.manualStopReason ? 'MANUAL' : 'DEPENDENCY',
        ...(cause.dependencyId ? { dependencyId: cause.dependencyId } : {}),
      },
      at: now,
    });

    return updated;
  }

  // --- Sigue en parada: solo puede cambiar la causa efectiva ------------------
  if (shouldBlock && initiative.isBlocked) {
    if (cause.reason === initiative.stopReason && cause.description === initiative.blockedDescription) {
      return initiative;
    }
    // Cambia el motivo visible (p. ej. se resolvió la dependencia que la causaba
    // y toma el relevo otra), pero la parada nunca se interrumpió: no se emite
    // un nuevo BLOCKED_SET ni se reinicia el reloj.
    return store.updateInitiative(initiative.id, {
      stopReason: cause.reason,
      blockedDescription: cause.description,
      updatedAt: now.toISOString(),
    });
  }

  // --- Sale de parada --------------------------------------------------------
  if (!shouldBlock && initiative.isBlocked) {
    const blockedMsInStage = consolidateBlockedTime(initiative, now);

    const updated = await store.updateInitiative(initiative.id, {
      isBlocked: false,
      stopReason: null,
      blockedDescription: null,
      blockedSince: null,
      blockedStartedAt: null,
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
        automatic: options.trigger?.automatic ?? false,
        ...(options.trigger?.note ? { note: options.trigger.note } : {}),
        ...(options.trigger?.dependencyId ? { dependencyId: options.trigger.dependencyId } : {}),
      },
      at: now,
    });

    return updated;
  }

  return initiative;
}

export interface SetManualStopInput {
  initiativeId: string;
  stopReason: StopReason;
  description: string;
  now?: Date;
}

/** Declara una parada a mano. Solo la levanta a mano quien corresponda. */
export async function setManualStop(
  store: DataStore,
  session: SessionContext,
  input: SetManualStopInput,
): Promise<Initiative> {
  const now = input.now ?? new Date();
  const initiative = await loadInitiative(store, input.initiativeId);
  if (initiative.isArchived) throw invalidState('La iniciativa está archivada.');

  assertPermission(
    canBlockInitiative(session, initiative),
    `La parada la declara ${DEPARTMENT_LABELS[initiative.ownerDepartment]}, que es quien tiene el trabajo, o Dirección.`,
  );

  await store.updateInitiative(initiative.id, {
    manualStopReason: input.stopReason,
    manualStopDescription: input.description,
    updatedAt: now.toISOString(),
  });

  return recomputeBlockState(store, session, initiative.id, { now });
}

/**
 * Levanta la parada declarada a mano.
 *
 * Si quedan dependencias bloqueantes pendientes, la iniciativa **sigue parada**
 * por ellas: lo que se retira es la causa manual, no el estado.
 */
export async function clearManualStop(
  store: DataStore,
  session: SessionContext,
  input: { initiativeId: string; note?: string; now?: Date },
): Promise<Initiative> {
  const now = input.now ?? new Date();
  const initiative = await loadInitiative(store, input.initiativeId);

  assertPermission(
    canBlockInitiative(session, initiative),
    `La parada la levanta ${DEPARTMENT_LABELS[initiative.ownerDepartment]} o Dirección.`,
  );

  await store.updateInitiative(initiative.id, {
    manualStopReason: null,
    manualStopDescription: null,
    updatedAt: now.toISOString(),
  });

  return recomputeBlockState(store, session, initiative.id, {
    now,
    trigger: { note: input.note },
  });
}

/**
 * Consecuencia de abrir o cerrar una dependencia bloqueante.
 *
 * No lleva comprobación de permiso propia: quien llega aquí ya ha superado la
 * de la acción que lo provocó (abrir la solicitud, resolverla o rechazarla).
 */
export function syncBlockFromDependencies(
  store: DataStore,
  session: SessionContext,
  initiativeId: string,
  options: { dependencyId?: string; automatic?: boolean; note?: string; now?: Date } = {},
): Promise<Initiative> {
  return recomputeBlockState(store, session, initiativeId, {
    now: options.now,
    trigger: {
      dependencyId: options.dependencyId,
      automatic: options.automatic ?? true,
      note: options.note,
    },
  });
}
