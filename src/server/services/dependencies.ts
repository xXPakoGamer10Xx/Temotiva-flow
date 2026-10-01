import { randomUUID } from 'node:crypto';
import type { Department, HelpType } from '@/domain/enums';
import type { Dependency, Initiative, SessionContext } from '@/domain/types';
import { belongsTo } from '@/domain/types';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import { MIN_DEPENDENCY_DESCRIPTION, MIN_RESOLUTION_NOTES } from '@/domain/rules';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { forbidden, invalid, invalidState, notFound } from './errors';
import { loadInitiative, syncBlockFromDependencies } from './blocking';

/**
 * Dependencias 🆘 (TemoFlow.md §1.1.B, DESIGN.md §7.4).
 *
 * Invariante de no-ping-pong: abrir una dependencia NUNCA transfiere la
 * propiedad de la iniciativa. El departamento propietario sigue siendo el de la
 * fase actual; el otro departamento colabora sin heredar la responsabilidad.
 */

export interface CreateDependencyInput {
  initiativeId: string;
  targetDepartment: Department;
  helpType: HelpType;
  description: string;
  isBlocking: boolean;
  /** Requisito de compuerta que originó la solicitud, si nace del panel de pendientes. */
  checklistItemId?: string;
  now?: Date;
}

export async function createDependency(
  store: DataStore,
  session: SessionContext,
  input: CreateDependencyInput,
): Promise<{ dependency: Dependency; initiative: Initiative }> {
  const now = input.now ?? new Date();
  const initiative = await loadInitiative(store, input.initiativeId);
  if (initiative.isArchived) throw invalidState('La iniciativa está archivada.');

  const description = input.description.trim();
  if (description.length < MIN_DEPENDENCY_DESCRIPTION) {
    throw invalid(`Describe la petición con al menos ${MIN_DEPENDENCY_DESCRIPTION} caracteres.`);
  }

  // Pedirse ayuda a uno mismo no es una dependencia, es el propio trabajo. Y
  // permitirlo abría la puerta a pararse y despararse a voluntad.
  if (input.targetDepartment === initiative.ownerDepartment) {
    throw invalid(
      `La iniciativa ya es de ${DEPARTMENT_LABELS[initiative.ownerDepartment]}: una solicitud de ayuda se dirige a otro departamento.`,
    );
  }

  // El vínculo con el requisito solo vale si es de la fase en curso: cualquier
  // otro identificador vendría de un cliente manipulado.
  let checklistItemId: string | null = null;
  if (input.checklistItemId) {
    const item = await store.checklistItemById(input.checklistItemId);
    if (!item || item.stageId !== initiative.currentStageId) {
      throw invalid('El requisito indicado no pertenece a la fase actual de la iniciativa.');
    }
    checklistItemId = item.id;
  }

  const dependency: Dependency = {
    id: randomUUID(),
    initiativeId: initiative.id,
    requestedBy: session.userId,
    targetDepartment: input.targetDepartment,
    helpType: input.helpType,
    isBlocking: input.isBlocking,
    description,
    checklistItemId,
    status: 'PENDING',
    resolutionNotes: null,
    resolvedBy: null,
    createdAt: now.toISOString(),
    resolvedAt: null,
  };

  await store.insertDependency(dependency);

  await audit(store, {
    initiativeId: initiative.id,
    session,
    actionType: 'DEPENDENCY_CREATED',
    newValue: {
      dependencyId: dependency.id,
      targetDepartment: dependency.targetDepartment,
      helpType: dependency.helpType,
      isBlocking: dependency.isBlocking,
      // Sin el texto, la trazabilidad decía que se pidió ayuda pero no qué.
      description,
      ...(checklistItemId ? { checklistItemId } : {}),
    },
    at: now,
  });

  // Trigger de bloqueo automático: el estado se recalcula a partir de todas las
  // dependencias bloqueantes vivas, así que abrir la segunda no vuelve a
  // registrar una parada que ya estaba abierta.
  const current = input.isBlocking
    ? await syncBlockFromDependencies(store, session, initiative.id, {
        dependencyId: dependency.id,
        now,
      })
    : await loadInitiative(store, initiative.id);

  // La propiedad no se mueve (no-ping-pong).
  return { dependency, initiative: current };
}

async function loadDependency(store: DataStore, dependencyId: string): Promise<Dependency> {
  const dependency = await store.dependencyById(dependencyId);
  if (!dependency) throw notFound('La solicitud de ayuda no existe.');
  return dependency;
}

/**
 * Puede cerrar una solicitud el departamento destinatario (es quien responde),
 * Dirección, o quien la abrió si decide retirarla.
 */
function assertCanClose(session: SessionContext, dependency: Dependency): void {
  const isTarget = belongsTo(session, dependency.targetDepartment);
  const isRequester = session.userId === dependency.requestedBy;
  if (session.role !== 'EXECUTIVE' && !isTarget && !isRequester) {
    throw forbidden(
      `Solo ${DEPARTMENT_LABELS[dependency.targetDepartment]} o quien abrió la solicitud pueden cerrarla.`,
    );
  }
}

export interface CloseDependencyInput {
  dependencyId: string;
  resolutionNotes: string;
  now?: Date;
}

async function closeDependency(
  store: DataStore,
  session: SessionContext,
  input: CloseDependencyInput,
  status: 'RESOLVED' | 'REJECTED',
): Promise<{ dependency: Dependency; initiative: Initiative }> {
  const now = input.now ?? new Date();
  const dependency = await loadDependency(store, input.dependencyId);
  assertCanClose(session, dependency);

  if (dependency.status !== 'PENDING') {
    throw invalidState('Esta solicitud ya estaba cerrada.');
  }

  const notes = input.resolutionNotes.trim();
  if (notes.length < MIN_RESOLUTION_NOTES) {
    throw invalid(`Escribe una respuesta de al menos ${MIN_RESOLUTION_NOTES} caracteres.`);
  }

  const updated = await store.updateDependency(dependency.id, {
    status,
    resolutionNotes: notes,
    resolvedBy: session.userId,
    resolvedAt: now.toISOString(),
  });

  await audit(store, {
    initiativeId: dependency.initiativeId,
    session,
    actionType: status === 'RESOLVED' ? 'DEPENDENCY_RESOLVED' : 'DEPENDENCY_REJECTED',
    oldValue: { status: 'PENDING' },
    newValue: {
      dependencyId: dependency.id,
      status,
      targetDepartment: dependency.targetDepartment,
      resolutionNotes: notes,
    },
    at: now,
  });

  // Al cerrar una bloqueante se recalcula la parada: se levanta sola solo si no
  // queda ninguna otra dependencia bloqueante **ni** una parada manual viva.
  const initiative = dependency.isBlocking
    ? await syncBlockFromDependencies(store, session, dependency.initiativeId, {
        dependencyId: dependency.id,
        note: 'Parada levantada automáticamente al resolverse la última dependencia bloqueante.',
        now,
      })
    : await loadInitiative(store, dependency.initiativeId);

  return { dependency: updated, initiative };
}

export function resolveDependency(
  store: DataStore,
  session: SessionContext,
  input: CloseDependencyInput,
): Promise<{ dependency: Dependency; initiative: Initiative }> {
  return closeDependency(store, session, input, 'RESOLVED');
}

export function rejectDependency(
  store: DataStore,
  session: SessionContext,
  input: CloseDependencyInput,
): Promise<{ dependency: Dependency; initiative: Initiative }> {
  return closeDependency(store, session, input, 'REJECTED');
}
