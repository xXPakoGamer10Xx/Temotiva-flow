import { randomUUID } from 'node:crypto';
import type { Department, HelpStatus, HelpType } from '@/domain/enums';
import { DEPARTMENTS } from '@/domain/enums';
import {
  DEPARTMENT_REQUEST_HELP_TYPES,
  type AttachmentSide,
  type DepartmentRequest,
  type DepartmentRequestAttachment,
  type DepartmentRequestStatus,
  type RequestFileAttachment,
  type RequestLinkAttachment,
} from '@/domain/department-request';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import {
  MAX_CLOSED_INBOX_ITEMS,
  MAX_DEPARTMENT_REQUEST_TITLE,
  MAX_REQUEST_FILES_PER_SIDE,
  MAX_REQUEST_FILE_BYTES,
  MAX_REQUEST_LINKS_PER_SIDE,
  MAX_REQUEST_LINK_LABEL,
  MAX_REQUEST_LINK_URL,
  MIN_DEPARTMENT_REQUEST_DESCRIPTION,
  MIN_DEPARTMENT_REQUEST_RESOLUTION_NOTES,
  MIN_DEPARTMENT_REQUEST_TITLE,
  MIN_REQUEST_LINK_LABEL,
} from '@/domain/rules';
import type { SessionContext } from '@/domain/types';
import { belongsTo } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { PDF_MIME, detectDocumentType, sanitizeFileName } from './attachments';
import { audit } from './audit';
import { forbidden, invalid, invalidState, notFound } from './errors';
import { detectImageType } from './feedback';
import {
  canAttachToDepartmentRequest,
  canManageDepartmentRequest,
  canRemoveDepartmentRequestAttachment,
  canViewDepartmentRequest,
  canViewInitiativeDependencyInInbox,
} from './rbac';

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
  /** Ampliación A: archivos y enlaces, en orden de llegada. */
  attachments: RequestAttachmentView[];
  canAttachRequest: boolean;
  canAttachResponse: boolean;
}

interface AttachmentViewBase {
  id: string;
  side: AttachmentSide;
  addedByName: string;
  addedAt: string;
  /** Ampliación B: la sesión puede retirarlo. */
  canRemove: boolean;
}

/** Sin clave de almacenamiento: el archivo solo sale por la ruta de descarga con Need-to-Know. */
export type RequestAttachmentView =
  | (AttachmentViewBase & { kind: 'FILE'; fileName: string; contentType: string; sizeBytes: number; downloadUrl: string })
  | (AttachmentViewBase & { kind: 'LINK'; label: string; url: string });

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
  const [requests, dependencies, users, initiatives, attachments] = await Promise.all([
    store.listDepartmentRequests(),
    store.listDependencies(),
    store.listUsers(),
    store.listInitiatives(),
    store.listDepartmentRequestAttachments(),
  ]);
  const userName = new Map(users.map((user) => [user.id, user.name]));
  const nameOf = (id: string): string => userName.get(id) ?? RETIRED_PERSON;
  // Los retirados no se proyectan: siguen en la base de datos y en el log.
  const attachmentsByRequest = new Map<string, DepartmentRequestAttachment[]>();
  for (const item of attachments) {
    if (item.isRemoved) continue;
    const list = attachmentsByRequest.get(item.requestId) ?? [];
    list.push(item);
    attachmentsByRequest.set(item.requestId, list);
  }
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
        // Solo se proyectan los adjuntos de peticiones que ya pasaron el Need-to-Know.
        attachments: (attachmentsByRequest.get(request.id) ?? []).map((item) =>
          toAttachmentView(item, nameOf, canRemoveDepartmentRequestAttachment(session, request, item)),
        ),
        canAttachRequest: canAttachToDepartmentRequest(session, request, 'REQUEST'),
        canAttachResponse: canAttachToDepartmentRequest(session, request, 'RESPONSE'),
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

/** Ruta de descarga con Need-to-Know (`app/api/department-requests/attachments/[id]`). */
export function departmentRequestFileUrl(attachmentId: string): string {
  return `/api/department-requests/attachments/${attachmentId}`;
}

function toAttachmentView(
  item: DepartmentRequestAttachment,
  nameOf: (id: string) => string,
  canRemove: boolean,
): RequestAttachmentView {
  const base = { id: item.id, side: item.side, addedByName: nameOf(item.addedBy), addedAt: item.addedAt, canRemove };
  return item.kind === 'FILE'
    ? {
        ...base,
        kind: 'FILE',
        fileName: item.fileName,
        contentType: item.contentType,
        sizeBytes: item.sizeBytes,
        downloadUrl: departmentRequestFileUrl(item.id),
      }
    : { ...base, kind: 'LINK', label: item.label, url: item.url };
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
  /** Ampliación A: enlaces «de la petición». Los archivos se suben aparte (Route Handler). */
  links?: RequestLinkInput[];
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

  // Los enlaces se validan antes de persistir nada: o entra todo, o nada.
  const links = normalizeLinks(input.links ?? []);
  assertQuota(0, links.length, MAX_REQUEST_LINKS_PER_SIDE, 'enlaces');

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

  await insertLinks(store, session, request.id, 'REQUEST', links, now);

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
  /** Ampliación A: enlaces «de la respuesta», guardados antes de cerrar. */
  links?: RequestLinkInput[];
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

  // Se validan antes de tocar nada y se guardan antes de cerrar: tras RESOLVED
  // ya no se admiten adjuntos.
  const links = normalizeLinks(input.links ?? []);
  if (links.length > 0) {
    const existing = await countOnSide(store, request.id, 'RESPONSE', 'LINK');
    assertQuota(existing, links.length, MAX_REQUEST_LINKS_PER_SIDE, 'enlaces');
    await insertLinks(store, session, request.id, 'RESPONSE', links, now);
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

// --- Ampliación A: adjuntos y enlaces (spec 001 §13) ------------------------------

export interface RequestLinkInput {
  label: string;
  url: string;
}

const LINK_LABEL_ERROR = `Cada enlace necesita un nombre de entre ${MIN_REQUEST_LINK_LABEL} y ${MAX_REQUEST_LINK_LABEL} caracteres.`;
const LINK_URL_ERROR = 'Cada enlace debe ser una dirección https:// válida.';
export const REQUEST_FILE_TYPE_ERROR = 'Solo se admiten PDF, Word (.docx) o imágenes PNG, JPG y WebP.';

/**
 * Enlaces recortados y validados. Solo `https:` (ni `http:` ni `javascript:`)
 * y sin credenciales incrustadas. Se guarda la URL tal como la escribieron.
 */
function normalizeLinks(links: RequestLinkInput[]): RequestLinkInput[] {
  return links.map((link) => {
    const label = link.label.trim();
    const url = link.url.trim();
    if (label.length < MIN_REQUEST_LINK_LABEL || label.length > MAX_REQUEST_LINK_LABEL) throw invalid(LINK_LABEL_ERROR);
    if (url.length > MAX_REQUEST_LINK_URL) throw invalid(`La dirección del enlace no puede superar ${MAX_REQUEST_LINK_URL} caracteres.`);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw invalid(LINK_URL_ERROR);
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw invalid(LINK_URL_ERROR);
    return { label, url };
  });
}

function assertQuota(existing: number, adding: number, max: number, what: 'archivos' | 'enlaces'): void {
  if (existing + adding > max) throw invalid(`Cada parte de la petición admite como máximo ${max} ${what}.`);
}

async function countOnSide(
  store: DataStore,
  requestId: string,
  side: AttachmentSide,
  kind: DepartmentRequestAttachment['kind'],
): Promise<number> {
  const items = await store.listDepartmentRequestAttachments(requestId);
  // Lo retirado libera su hueco en el cupo.
  return items.filter((item) => !item.isRemoved && item.side === side && item.kind === kind).length;
}

/**
 * Distingue el motivo: no es tu lado (FORBIDDEN) o el estado ya no lo admite
 * (INVALID_STATE). La visibilidad ya la resolvió `loadDepartmentRequest`.
 */
function assertCanAttach(session: SessionContext, request: DepartmentRequest, side: AttachmentSide): void {
  if (canAttachToDepartmentRequest(session, request, side)) return;
  const isYourSide =
    side === 'REQUEST' ? belongsTo(session, request.sourceDepartment) : canManageDepartmentRequest(session, request);
  if (!isYourSide) {
    throw forbidden(
      side === 'REQUEST'
        ? `Solo ${DEPARTMENT_LABELS[request.sourceDepartment]} puede adjuntar material a lo que pidió.`
        : `Solo ${DEPARTMENT_LABELS[request.targetDepartment]} puede adjuntar material a la respuesta.`,
    );
  }
  throw invalidState(
    side === 'REQUEST'
      ? 'La petición ya se está atendiendo: ya no se le pueden añadir adjuntos.'
      : 'La petición ya está resuelta: ya no admite adjuntos.',
  );
}

/** Evento global y sin nombre de archivo ni URL: puede contener datos personales. */
function auditAttachment(
  store: DataStore,
  session: SessionContext,
  item: DepartmentRequestAttachment,
  now: Date,
): Promise<unknown> {
  return audit(store, {
    initiativeId: null,
    session,
    actionType: 'DEPARTMENT_REQUEST_ATTACHMENT_ADDED',
    fieldName: AUDIT_FIELD,
    newValue: {
      requestId: item.requestId,
      attachmentId: item.id,
      side: item.side,
      kind: item.kind,
      ...(item.kind === 'FILE' ? { contentType: item.contentType, sizeBytes: item.sizeBytes } : {}),
    },
    at: now,
  });
}

async function insertLinks(
  store: DataStore,
  session: SessionContext,
  requestId: string,
  side: AttachmentSide,
  links: RequestLinkInput[],
  now: Date,
): Promise<RequestLinkAttachment[]> {
  const saved: RequestLinkAttachment[] = [];
  for (const link of links) {
    const item: RequestLinkAttachment = {
      id: randomUUID(),
      requestId,
      side,
      kind: 'LINK',
      label: link.label,
      url: link.url,
      addedBy: session.userId,
      addedAt: now.toISOString(),
      isRemoved: false,
      removedBy: null,
      removedAt: null,
    };
    await store.insertDepartmentRequestAttachment(item);
    await auditAttachment(store, session, item, now);
    saved.push(item);
  }
  return saved;
}

export interface AddDepartmentRequestLinksInput {
  requestId: string;
  side: AttachmentSide;
  links: RequestLinkInput[];
  now?: Date;
}

/** Añade enlaces en el lado que le toca a la sesión (RF-17, RF-18, RF-20). */
export async function addDepartmentRequestLinks(
  store: DataStore,
  session: SessionContext,
  input: AddDepartmentRequestLinksInput,
): Promise<RequestLinkAttachment[]> {
  const now = input.now ?? new Date();
  const request = await loadDepartmentRequest(store, session, input.requestId);
  assertCanAttach(session, request, input.side);
  const links = normalizeLinks(input.links);
  if (links.length === 0) throw invalid('Añade al menos un enlace.');
  assertQuota(await countOnSide(store, request.id, input.side, 'LINK'), links.length, MAX_REQUEST_LINKS_PER_SIDE, 'enlaces');
  return insertLinks(store, session, request.id, input.side, links, now);
}

export interface AddDepartmentRequestFileInput {
  requestId: string;
  side: AttachmentSide;
  fileName: string;
  bytes: Uint8Array;
  now?: Date;
}

/** `put` del almacenamiento privado, inyectado para que el servicio siga siendo puro. */
export type PutFile = (key: string, bytes: Uint8Array, contentType: string) => Promise<void>;

/** Tipo real por los bytes: PDF, DOCX, PNG, JPEG o WebP. GIF y SVG quedan fuera. */
function detectRequestFileType(bytes: Uint8Array): { contentType: string; extension: string } | null {
  const document = detectDocumentType(bytes);
  if (document) return { contentType: document, extension: document === PDF_MIME ? 'pdf' : 'docx' };
  const image = detectImageType(bytes);
  if (image && image.extension !== 'gif') return { contentType: image.contentType, extension: image.extension };
  return null;
}

/** Sube un archivo al lado que le toca a la sesión (RF-17 a RF-19). */
export async function addDepartmentRequestFile(
  store: DataStore,
  session: SessionContext,
  put: PutFile,
  input: AddDepartmentRequestFileInput,
): Promise<RequestFileAttachment> {
  const now = input.now ?? new Date();
  const request = await loadDepartmentRequest(store, session, input.requestId);
  assertCanAttach(session, request, input.side);

  if (input.bytes.byteLength === 0) throw invalid('El archivo está vacío.');
  if (input.bytes.byteLength > MAX_REQUEST_FILE_BYTES) throw invalid('El archivo supera 4 MB.');
  const type = detectRequestFileType(input.bytes);
  if (!type) throw invalid(REQUEST_FILE_TYPE_ERROR);
  assertQuota(await countOnSide(store, request.id, input.side, 'FILE'), 1, MAX_REQUEST_FILES_PER_SIDE, 'archivos');

  const id = randomUUID();
  const item: RequestFileAttachment = {
    id,
    requestId: request.id,
    side: input.side,
    kind: 'FILE',
    fileName: sanitizeFileName(input.fileName),
    contentType: type.contentType,
    sizeBytes: input.bytes.byteLength,
    // La clave la genera el servidor: nada del nombre del cliente llega a la ruta.
    storageKey: `department-requests/${request.id}/${id}.${type.extension}`,
    addedBy: session.userId,
    addedAt: now.toISOString(),
    isRemoved: false,
    removedBy: null,
    removedAt: null,
  };

  // Primero el archivo y después la fila: nunca queda una fila apuntando a nada.
  await put(item.storageKey, input.bytes, item.contentType);
  await store.insertDepartmentRequestAttachment(item);
  await auditAttachment(store, session, item, now);
  return item;
}

/**
 * Archivo para la ruta de descarga, solo si la sesión puede ver su petición.
 * En cualquier otro caso responde igual que si no existiera (RF-21).
 */
export async function getDepartmentRequestFile(
  store: DataStore,
  session: SessionContext,
  attachmentId: string,
): Promise<RequestFileAttachment> {
  const item = await store.departmentRequestAttachmentById(attachmentId);
  const request = item ? await store.departmentRequestById(item.requestId) : null;
  if (!item || item.kind !== 'FILE' || item.isRemoved || !request || !canViewDepartmentRequest(session, request)) {
    throw notFound('El archivo no existe.');
  }
  return item;
}

// --- Ampliación B: retirar adjuntos (spec 001 §14) --------------------------------

export interface RemoveDepartmentRequestAttachmentInput {
  attachmentId: string;
  now?: Date;
}

/**
 * Baja lógica de un archivo o enlace (RF-22). En cualquier estado de la
 * petición: es una corrección, no una edición. La fila y los bytes se
 * conservan (AGENTS.md §5.8); deja de mostrarse, de servirse y de ocupar cupo.
 */
export async function removeDepartmentRequestAttachment(
  store: DataStore,
  session: SessionContext,
  input: RemoveDepartmentRequestAttachmentInput,
): Promise<DepartmentRequestAttachment> {
  const now = input.now ?? new Date();
  const item = await store.departmentRequestAttachmentById(input.attachmentId);
  const request = item ? await store.departmentRequestById(item.requestId) : null;
  // Inexistente, ya retirado o de una petición que no ves: mismo mensaje (RF-8).
  if (!item || item.isRemoved || !request || !canViewDepartmentRequest(session, request)) {
    throw notFound('El adjunto no existe o ya se retiró.');
  }
  if (!canRemoveDepartmentRequestAttachment(session, request, item)) {
    const area = DEPARTMENT_LABELS[item.side === 'REQUEST' ? request.sourceDepartment : request.targetDepartment];
    throw forbidden(`Solo quien lo añadió, el responsable de ${area} o Dirección pueden retirarlo.`);
  }

  const removed = await store.markDepartmentRequestAttachmentRemoved(item.id, session.userId, now.toISOString());
  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'DEPARTMENT_REQUEST_ATTACHMENT_REMOVED',
    fieldName: AUDIT_FIELD,
    // Sin nombre de archivo ni URL, igual que al añadirlo.
    newValue: { requestId: item.requestId, attachmentId: item.id, side: item.side, kind: item.kind },
    at: now,
  });
  return removed;
}
