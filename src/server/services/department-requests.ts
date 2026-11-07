import { randomUUID } from 'node:crypto';
import type { Department, HelpStatus, HelpType } from '@/domain/enums';
import { DEPARTMENTS } from '@/domain/enums';
import {
  DEPARTMENT_REQUEST_HELP_TYPES,
  type DepartmentRequest,
  type DepartmentRequestStatus,
} from '@/domain/department-request';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import {
  MAX_CLOSED_INBOX_ITEMS,
  MAX_DEPARTMENT_REQUEST_TITLE,
  MIN_DEPARTMENT_REQUEST_DESCRIPTION,
  MIN_DEPARTMENT_REQUEST_RESOLUTION_NOTES,
  MIN_DEPARTMENT_REQUEST_TITLE,
} from '@/domain/rules';
import type { SessionContext } from '@/domain/types';
import { belongsTo } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { forbidden, invalid, invalidState, notFound } from './errors';
import { canManageDepartmentRequest, canViewDepartmentRequest, canViewInitiativeDependencyInInbox } from './rbac';

/**
 * Buzón de Dependencias (spec 001): peticiones entre áreas (`department_requests`)
 * y, en solo lectura, las dependencias 🆘 de iniciativa que afectan a la sesión.
 *
 * Módulo independiente de `dependencies.ts`: no llama a sus servicios ni a
 * `recomputeBlockState`. El Need-to-Know se aplica aquí, antes de proyectar:
 * el cliente nunca recibe filas (ni conteos) de áreas ajenas.
 */

const RETIRED_PERSON = 'Persona retirada';

export interface DepartmentRequestView {
  id: string;
  title: string;
  description: string;
  sourceDepartment: Department;
  targetDepartment: Department;
  requestedByName: string;
  helpType: HelpType;
  status: DepartmentRequestStatus;
  /** Informativo: no detiene el SLE. */
  blocksInitiative: boolean;
  initiativeId: string | null;
  initiativeTitle: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  resolutionNotes: string | null;
  resolvedByName: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  isIncoming: boolean;
  isOutgoing: boolean;
  canStart: boolean;
  canResolve: boolean;
}

/** Dependencia 🆘 de iniciativa en solo lectura (RF-16); se gestiona en su ficha. */
export interface InitiativeDependencyView {
  id: string;
  initiativeId: string;
  initiativeTitle: string;
  /** Origen efectivo: el área dueña actual de la iniciativa. */
  ownerDepartment: Department;
  targetDepartment: Department;
  helpType: HelpType;
  /** Real: esta sí detiene el SLE de la iniciativa. */
  isBlocking: boolean;
  status: HelpStatus;
  description: string;
  requestedByName: string;
  createdAt: string;
  resolvedAt: string | null;
  isIncoming: boolean;
  isOutgoing: boolean;
}

export interface DepartmentRequestsView {
  requests: DepartmentRequestView[];
  initiativeDependencies: InitiativeDependencyView[];
  /** Hay más cerradas de las que se envían (`MAX_CLOSED_INBOX_ITEMS` por fuente). */
  closedTruncated: boolean;
  /** Áreas desde las que la sesión puede pedir ayuda: solo las suyas. */
  sourceDepartments: Department[];
  targetDepartments: Department[];
  canCreate: boolean;
  /** Iniciativas vivas para dar contexto opcional al crear. */
  initiatives: { id: string; title: string }[];
}

export async function getDepartmentRequestsView(
  store: DataStore,
  session: SessionContext,
): Promise<DepartmentRequestsView> {
  const [requests, dependencies, users, initiatives] = await Promise.all([
    store.listDepartmentRequests(),
    store.listDependencies(),
    store.listUsers(),
    store.listInitiatives(),
  ]);
  const userName = new Map(users.map((user) => [user.id, user.name]));
  const nameOf = (id: string): string => userName.get(id) ?? RETIRED_PERSON;
  // `listInitiatives()` excluye las archivadas: lo que no esté aquí no se muestra.
  const liveInitiatives = new Map(initiatives.map((initiative) => [initiative.id, initiative]));

  const requestViews: DepartmentRequestView[] = requests
    .filter((request) => canViewDepartmentRequest(session, request))
    .map((request) => {
      const canManage = canManageDepartmentRequest(session, request);
      return {
        id: request.id,
        title: request.title,
        description: request.description,
        sourceDepartment: request.sourceDepartment,
        targetDepartment: request.targetDepartment,
        requestedByName: nameOf(request.requestedBy),
        helpType: request.helpType,
        status: request.status,
        blocksInitiative: request.blocksInitiative,
        initiativeId: request.initiativeId,
        initiativeTitle: request.initiativeId ? (liveInitiatives.get(request.initiativeId)?.title ?? null) : null,
        assigneeId: request.assigneeId,
        assigneeName: request.assigneeId ? nameOf(request.assigneeId) : null,
        resolutionNotes: request.resolutionNotes,
        resolvedByName: request.resolvedBy ? nameOf(request.resolvedBy) : null,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
        resolvedAt: request.resolvedAt,
        isIncoming: belongsTo(session, request.targetDepartment),
        isOutgoing: belongsTo(session, request.sourceDepartment),
        canStart: canManage && request.status === 'PENDING',
        canResolve: canManage && request.status !== 'RESOLVED',
      };
    });

  const dependencyViews: InitiativeDependencyView[] = [];
  for (const dependency of dependencies) {
    const initiative = liveInitiatives.get(dependency.initiativeId);
    if (!initiative || !canViewInitiativeDependencyInInbox(session, dependency, initiative)) continue;
    dependencyViews.push({
      id: dependency.id,
      initiativeId: initiative.id,
      initiativeTitle: initiative.title,
      ownerDepartment: initiative.ownerDepartment,
      targetDepartment: dependency.targetDepartment,
      helpType: dependency.helpType,
      isBlocking: dependency.isBlocking,
      status: dependency.status,
      description: dependency.description,
      requestedByName: nameOf(dependency.requestedBy),
      createdAt: dependency.createdAt,
      resolvedAt: dependency.resolvedAt,
      isIncoming: belongsTo(session, dependency.targetDepartment),
      isOutgoing: belongsTo(session, initiative.ownerDepartment) || dependency.requestedBy === session.userId,
    });
  }
  dependencyViews.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Listado acotado (spec §10): lo abierto es trabajo vivo y va entero; de lo
  // cerrado, solo lo más reciente. El recorte se hace tras el Need-to-Know.
  const cappedRequests = capClosed(requestViews, (request) => request.status === 'RESOLVED');
  const cappedDependencies = capClosed(dependencyViews, (dependency) => dependency.status !== 'PENDING');

  const sourceDepartments = [...session.departments];
  return {
    requests: cappedRequests.items,
    initiativeDependencies: cappedDependencies.items,
    closedTruncated: cappedRequests.truncated || cappedDependencies.truncated,
    sourceDepartments,
    targetDepartments: [...DEPARTMENTS],
    canCreate: sourceDepartments.length > 0,
    initiatives: initiatives.map((initiative) => ({ id: initiative.id, title: initiative.title })),
  };
}

/** Conserva el orden y todas las abiertas; de las cerradas, solo las primeras `limit`. */
function capClosed<T>(
  items: T[],
  isClosed: (item: T) => boolean,
  limit: number = MAX_CLOSED_INBOX_ITEMS,
): { items: T[]; truncated: boolean } {
  let closedSeen = 0;
  const kept = items.filter((item) => {
    if (!isClosed(item)) return true;
    closedSeen += 1;
    return closedSeen <= limit;
  });
  return { items: kept, truncated: closedSeen > limit };
}

// --- Mutaciones ---------------------------------------------------------------------

/**
 * Los eventos del módulo son siempre globales (`initiative_id = NULL`): la caja
 * negra de una iniciativa se muestra en su ficha a cualquiera que la abra, y un
 * evento ligado revelaría que existe una petición entre áreas ajenas. El
 * TEMO-XXX, si lo hay, viaja dentro de `newValue`. Nunca se vuelcan textos.
 */
const AUDIT_FIELD = 'department_requests';

export interface CreateDepartmentRequestInput {
  sourceDepartment: Department;
  targetDepartment: Department;
  helpType: HelpType;
  title: string;
  description: string;
  /** Informativo: nunca escribe `is_blocked` ni toca el SLE. */
  blocksInitiative: boolean;
  initiativeId?: string | null;
  now?: Date;
}

export async function createDepartmentRequest(
  store: DataStore,
  session: SessionContext,
  input: CreateDepartmentRequestInput,
): Promise<DepartmentRequest> {
  const now = input.now ?? new Date();

  // Se pide ayuda en nombre de un área propia; ni Dirección suplanta a otra.
  if (!belongsTo(session, input.sourceDepartment)) {
    throw forbidden(`Solo puedes pedir ayuda en nombre de un área a la que perteneces.`);
  }
  if (input.sourceDepartment === input.targetDepartment) {
    throw invalid(
      `La petición sale de ${DEPARTMENT_LABELS[input.sourceDepartment]}: dirígela a otra área.`,
    );
  }
  if (!(DEPARTMENT_REQUEST_HELP_TYPES as readonly HelpType[]).includes(input.helpType)) {
    throw invalid('Elige un tipo de necesidad válido.');
  }

  const title = input.title.trim();
  if (title.length < MIN_DEPARTMENT_REQUEST_TITLE || title.length > MAX_DEPARTMENT_REQUEST_TITLE) {
    throw invalid(
      `El título debe tener entre ${MIN_DEPARTMENT_REQUEST_TITLE} y ${MAX_DEPARTMENT_REQUEST_TITLE} caracteres.`,
    );
  }
  const description = input.description.trim();
  if (description.length < MIN_DEPARTMENT_REQUEST_DESCRIPTION) {
    throw invalid(`Describe la petición con al menos ${MIN_DEPARTMENT_REQUEST_DESCRIPTION} caracteres.`);
  }

  // Contexto opcional. Mismo mensaje para inexistente y archivada.
  let initiativeId: string | null = null;
  if (input.initiativeId) {
    const initiative = await store.initiativeById(input.initiativeId);
    if (!initiative || initiative.isArchived) {
      throw invalid('La iniciativa indicada no existe o está archivada.');
    }
    initiativeId = initiative.id;
  }

  const at = now.toISOString();
  const request: DepartmentRequest = {
    id: randomUUID(),
    title,
    description,
    sourceDepartment: input.sourceDepartment,
    targetDepartment: input.targetDepartment,
    requestedBy: session.userId,
    helpType: input.helpType,
    status: 'PENDING',
    blocksInitiative: input.blocksInitiative,
    initiativeId,
    assigneeId: null,
    resolutionNotes: null,
    resolvedBy: null,
    createdAt: at,
    updatedAt: at,
    resolvedAt: null,
  };

  await store.insertDepartmentRequest(request);
  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'DEPARTMENT_REQUEST_CREATED',
    fieldName: AUDIT_FIELD,
    newValue: {
      requestId: request.id,
      sourceDepartment: request.sourceDepartment,
      targetDepartment: request.targetDepartment,
      helpType: request.helpType,
      status: request.status,
      blocksInitiative: request.blocksInitiative,
      initiativeId,
    },
    at: now,
  });

  // A propósito no se toca la iniciativa: `blocksInitiative` es solo un indicador (RF-9).
  return request;
}

/**
 * Carga una petición solo si la sesión puede verla. Si no, responde igual que
 * si no existiera: ni el error revela que hay una petición entre áreas ajenas (RF-8).
 */
async function loadDepartmentRequest(
  store: DataStore,
  session: SessionContext,
  requestId: string,
): Promise<DepartmentRequest> {
  const request = await store.departmentRequestById(requestId);
  if (!request || !canViewDepartmentRequest(session, request)) throw notFound('La petición no existe.');
  return request;
}

function assertCanManage(session: SessionContext, request: DepartmentRequest): void {
  if (!canManageDepartmentRequest(session, request)) {
    throw forbidden(
      `Solo ${DEPARTMENT_LABELS[request.targetDepartment]} puede atender esta petición; el área que la pidió solo puede consultarla.`,
    );
  }
}

export interface StartDepartmentRequestInput {
  requestId: string;
  now?: Date;
}

/** Pendiente → En curso: el área destino la toma y queda asignada a quien la toma. */
export async function startDepartmentRequest(
  store: DataStore,
  session: SessionContext,
  input: StartDepartmentRequestInput,
): Promise<DepartmentRequest> {
  const now = input.now ?? new Date();
  const request = await loadDepartmentRequest(store, session, input.requestId);
  assertCanManage(session, request);
  if (request.status !== 'PENDING') {
    throw invalidState('Esta petición ya estaba tomada o resuelta.');
  }

  const updated = await store.updateDepartmentRequest(request.id, {
    status: 'IN_PROGRESS',
    assigneeId: session.userId,
    updatedAt: now.toISOString(),
  });

  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'DEPARTMENT_REQUEST_STARTED',
    fieldName: AUDIT_FIELD,
    oldValue: { status: request.status },
    newValue: {
      requestId: request.id,
      status: updated.status,
      assigneeId: session.userId,
      targetDepartment: request.targetDepartment,
    },
    at: now,
  });

  return updated;
}

export interface ResolveDepartmentRequestInput {
  requestId: string;
  resolutionNotes: string;
  now?: Date;
}

/** Pendiente o En curso → Resuelta, con respuesta obligatoria. Después, solo lectura. */
export async function resolveDepartmentRequest(
  store: DataStore,
  session: SessionContext,
  input: ResolveDepartmentRequestInput,
): Promise<DepartmentRequest> {
  const now = input.now ?? new Date();
  const request = await loadDepartmentRequest(store, session, input.requestId);
  assertCanManage(session, request);
  if (request.status === 'RESOLVED') {
    throw invalidState('Esta petición ya estaba resuelta; si hace falta algo más, abre una nueva.');
  }

  const notes = input.resolutionNotes.trim();
  if (notes.length < MIN_DEPARTMENT_REQUEST_RESOLUTION_NOTES) {
    throw invalid(`Escribe una respuesta de al menos ${MIN_DEPARTMENT_REQUEST_RESOLUTION_NOTES} caracteres.`);
  }

  const at = now.toISOString();
  const updated = await store.updateDepartmentRequest(request.id, {
    status: 'RESOLVED',
    resolutionNotes: notes,
    resolvedBy: session.userId,
    resolvedAt: at,
    updatedAt: at,
  });

  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'DEPARTMENT_REQUEST_RESOLVED',
    fieldName: AUDIT_FIELD,
    oldValue: { status: request.status },
    // Las notas se quedan en la petición: el log solo registra el hecho.
    newValue: {
      requestId: request.id,
      status: updated.status,
      targetDepartment: request.targetDepartment,
    },
    at: now,
  });

  return updated;
}
