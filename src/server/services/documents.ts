import { randomUUID } from 'node:crypto';
import { DEPARTMENTS, DOCUMENT_SHARE_TARGETS } from '@/domain/enums';
import type { Department, DocumentShareTarget } from '@/domain/enums';
import {
  DOCUMENT_BLOCKED_ERROR,
  MAX_DOCUMENT_BYTES,
  documentMimeFor,
  hasBlockedExtension,
  looksExecutable,
} from '@/domain/document-files';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import { MAX_DOCUMENT_DESCRIPTION } from '@/domain/rules';
import type { DocumentShare, LibraryDocument, SessionContext } from '@/domain/types';
import { belongsTo } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { forbidden, invalid, notFound } from './errors';
import { canRemoveLibraryDocument, canShareDocument } from './rbac';
import { sanitizeFileName } from './attachments';

/**
 * Biblioteca de documentos por área.
 *
 * Cada documento pertenece a un área y lo ven sus miembros. Solo el LEAD de esa
 * área (o Dirección) lo abre a otras personas, áreas, a todos los LEAD o a toda
 * la empresa. Los atajos se guardan como destino y se resuelven al consultar,
 * así quien entra después también lo ve. Los eventos van a la caja negra sin
 * iniciativa. Servicio puro: el almacenamiento (`put`) se inyecta.
 */

type Put = (key: string, bytes: Uint8Array, contentType: string) => Promise<void>;

/** Vista mínima de una persona para decidir quién alcanza un documento. */
type Viewer = Pick<SessionContext, 'userId' | 'departments' | 'role'>;

/** ¿Este reparto llega a esta persona? */
function shareReaches(share: DocumentShare, viewer: Viewer): boolean {
  switch (share.targetType) {
    case 'USER':
      return share.targetUserId === viewer.userId;
    case 'DEPARTMENT':
      return share.targetDepartment !== null && viewer.departments.includes(share.targetDepartment);
    case 'LEADS':
      return viewer.role === 'LEAD';
    case 'ALL':
      return true;
  }
}

/** Regla de visibilidad: Dirección todo; el resto, su área, lo que subió o lo compartido con ellos. */
export function canViewDocument(session: SessionContext, document: LibraryDocument, shares: DocumentShare[]): boolean {
  if (document.isRemoved) return false;
  if (session.role === 'EXECUTIVE') return true;
  if (document.uploadedBy === session.userId || belongsTo(session, document.department)) return true;
  return shares.some((share) => share.documentId === document.id && shareReaches(share, session));
}

/** Carga el documento y comprueba que esta sesión lo ve. Sin acceso se responde "no existe". */
export async function loadViewableDocument(
  store: DataStore,
  session: SessionContext,
  documentId: string,
): Promise<LibraryDocument> {
  const document = await store.documentById(documentId);
  if (!document || document.isRemoved) throw notFound('El documento no existe o ya se retiró.');
  const shares = await store.listDocumentShares(documentId);
  if (!canViewDocument(session, document, shares)) throw notFound('El documento no existe o ya se retiró.');
  return document;
}

export interface UploadDocumentInput {
  fileName: string;
  bytes: Uint8Array;
  description?: string;
  /** Área dueña; por defecto, la principal de quien sube. */
  department?: Department;
  now?: Date;
}

export async function uploadDocument(
  store: DataStore,
  session: SessionContext,
  put: Put,
  input: UploadDocumentInput,
): Promise<LibraryDocument> {
  const now = input.now ?? new Date();
  const department = input.department ?? session.departments[0];
  if (!department || !DEPARTMENTS.includes(department)) throw invalid('Elige el área del documento.');
  if (session.role !== 'EXECUTIVE' && !belongsTo(session, department)) {
    throw forbidden('Solo puedes subir documentos a tus propias áreas.');
  }

  if (input.bytes.byteLength === 0) throw invalid('El archivo está vacío.');
  if (input.bytes.byteLength > MAX_DOCUMENT_BYTES) throw invalid('El archivo supera 4 MB.');

  const fileName = sanitizeFileName(input.fileName);
  if (hasBlockedExtension(fileName) || looksExecutable(input.bytes)) throw invalid(DOCUMENT_BLOCKED_ERROR);

  const description = (input.description ?? '').trim();
  if (description.length > MAX_DOCUMENT_DESCRIPTION) {
    throw invalid(`La descripción admite hasta ${MAX_DOCUMENT_DESCRIPTION} caracteres.`);
  }

  const id = randomUUID();
  const contentType = documentMimeFor(fileName);
  // La clave no lleva el nombre del cliente: nada que interpretar como ruta.
  const storageKey = `documents/${department}/${id}`;
  await put(storageKey, input.bytes, contentType);

  const document = await store.insertDocument({
    id,
    fileName,
    description,
    contentType,
    sizeBytes: input.bytes.byteLength,
    storageKey,
    department,
    uploadedBy: session.userId,
    uploadedAt: now.toISOString(),
    isRemoved: false,
    removedBy: null,
    removedAt: null,
  });

  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'DOCUMENT_UPLOADED',
    fieldName: 'documents',
    newValue: { documentId: id, fileName, department, sizeBytes: document.sizeBytes },
    at: now,
  });
  return document;
}

export interface ShareDocumentInput {
  documentId: string;
  targetType: DocumentShareTarget;
  targetUserId?: string;
  targetDepartment?: Department;
  now?: Date;
}

/** Abre un documento a otro destino. Compartir dos veces lo mismo no duplica filas. */
export async function shareDocument(
  store: DataStore,
  session: SessionContext,
  input: ShareDocumentInput,
): Promise<DocumentShare> {
  const now = input.now ?? new Date();
  const document = await store.documentById(input.documentId);
  if (!document || document.isRemoved) throw notFound('El documento no existe o ya se retiró.');
  if (!canShareDocument(session, document)) {
    throw forbidden('Solo el responsable del área dueña del documento o Dirección pueden compartirlo.');
  }
  if (!DOCUMENT_SHARE_TARGETS.includes(input.targetType)) throw invalid('Elige con quién compartir el documento.');

  let targetUserId: string | null = null;
  let targetDepartment: Department | null = null;
  let label: string;
  if (input.targetType === 'USER') {
    const user = input.targetUserId ? await store.userById(input.targetUserId) : null;
    if (!user || !user.isActive || user.isAnonymized) throw invalid('Esa persona no existe o no tiene acceso activo.');
    targetUserId = user.id;
    label = user.name;
  } else if (input.targetType === 'DEPARTMENT') {
    if (!input.targetDepartment || !DEPARTMENTS.includes(input.targetDepartment)) throw invalid('Elige un área.');
    targetDepartment = input.targetDepartment;
    label = `Equipo de ${DEPARTMENT_LABELS[targetDepartment]}`;
  } else {
    label = input.targetType === 'LEADS' ? 'Todos los responsables de área' : 'Toda la empresa';
  }

  const existing = (await store.listDocumentShares(document.id)).find(
    (share) =>
      share.targetType === input.targetType &&
      share.targetUserId === targetUserId &&
      share.targetDepartment === targetDepartment,
  );
  if (existing) return existing;

  const share = await store.insertDocumentShare({
    id: randomUUID(),
    documentId: document.id,
    targetType: input.targetType,
    targetUserId,
    targetDepartment,
    sharedBy: session.userId,
    sharedAt: now.toISOString(),
  });

  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'DOCUMENT_SHARED',
    fieldName: 'documents',
    newValue: { documentId: document.id, fileName: document.fileName, target: label },
    at: now,
  });
  return share;
}

/** Quita un reparto concreto; el documento y el log se conservan. */
export async function unshareDocument(
  store: DataStore,
  session: SessionContext,
  input: { shareId: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  const share = (await store.listDocumentShares()).find((candidate) => candidate.id === input.shareId);
  if (!share) throw notFound('Ese acceso ya no existe.');
  const document = await store.documentById(share.documentId);
  if (!document) throw notFound('El documento no existe.');
  if (!canShareDocument(session, document)) {
    throw forbidden('Solo el responsable del área dueña del documento o Dirección pueden cambiar quién lo ve.');
  }
  await store.deleteDocumentShare(share.id);
  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'DOCUMENT_UNSHARED',
    fieldName: 'documents',
    oldValue: { documentId: document.id, fileName: document.fileName, shareId: share.id },
    at: now,
  });
}

/** Baja lógica: quien lo subió, el LEAD del área dueña o Dirección. */
export async function removeDocument(
  store: DataStore,
  session: SessionContext,
  input: { documentId: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  const document = await loadViewableDocument(store, session, input.documentId);
  if (!canRemoveLibraryDocument(session, document)) {
    throw forbidden('Solo quien subió el documento, el responsable del área dueña o Dirección pueden retirarlo.');
  }
  await store.markDocumentRemoved(document.id, session.userId, now.toISOString());
  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'DOCUMENT_REMOVED',
    fieldName: 'documents',
    oldValue: { documentId: document.id, fileName: document.fileName },
    at: now,
  });
}

// --- Proyecciones de solo lectura para la interfaz ---------------------------

export interface DocumentShareView {
  id: string;
  label: string;
}

export interface DocumentView {
  id: string;
  fileName: string;
  description: string;
  sizeBytes: number;
  department: Department;
  uploadedByName: string;
  uploadedAt: string;
  /** `true` si pertenece a un área de quien consulta; `false` si le llegó compartido. */
  isOwnArea: boolean;
  canShare: boolean;
  canRemove: boolean;
  shares: DocumentShareView[];
}

export interface ShareTargetUser {
  id: string;
  name: string;
  departments: Department[];
}

export interface DocumentsPageView {
  documents: DocumentView[];
  /** Vacío si quien consulta no puede compartir nada (no se envían nombres de más). */
  people: ShareTargetUser[];
}

/** Las filas llegan al cliente sin correos ni identificadores de rutas de almacenamiento. */
export async function getDocumentsView(store: DataStore, session: SessionContext): Promise<DocumentsPageView> {
  const [documents, allShares, users] = await Promise.all([
    store.listDocuments(),
    store.listDocumentShares(),
    store.listUsers(),
  ]);
  const userName = new Map(users.map((user) => [user.id, user.name]));

  const views: DocumentView[] = [];
  for (const document of documents) {
    const shares = allShares.filter((share) => share.documentId === document.id);
    if (!canViewDocument(session, document, shares)) continue;
    const canShare = canShareDocument(session, document);
    views.push({
      id: document.id,
      fileName: document.fileName,
      description: document.description,
      sizeBytes: document.sizeBytes,
      department: document.department,
      uploadedByName: userName.get(document.uploadedBy) ?? 'Persona retirada',
      uploadedAt: document.uploadedAt,
      isOwnArea: belongsTo(session, document.department),
      canShare,
      canRemove: canRemoveLibraryDocument(session, document),
      // Quien no gestiona el documento no ve con quién más se comparte.
      shares: canShare ? shares.map((share) => ({ id: share.id, label: shareLabel(share, userName) })) : [],
    });
  }

  const canShareSomething = views.some((view) => view.canShare);
  const people = canShareSomething
    ? users
        .filter((user) => user.isActive && !user.isAnonymized && user.id !== session.userId)
        .map((user) => ({ id: user.id, name: user.name, departments: user.departments }))
    : [];
  return { documents: views, people };
}

function shareLabel(share: DocumentShare, userName: Map<string, string>): string {
  switch (share.targetType) {
    case 'USER':
      return share.targetUserId ? (userName.get(share.targetUserId) ?? 'Persona retirada') : 'Persona retirada';
    case 'DEPARTMENT':
      return share.targetDepartment ? `Equipo de ${DEPARTMENT_LABELS[share.targetDepartment]}` : 'Equipo';
    case 'LEADS':
      return 'Todos los responsables de área';
    case 'ALL':
      return 'Toda la empresa';
  }
}
