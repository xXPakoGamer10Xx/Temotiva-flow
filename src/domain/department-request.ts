import type { Department, HelpType } from './enums';
import { HELP_TYPES_V1 } from './enums';
import type { User } from './types';

/**
 * Peticiones entre áreas (spec 001 — módulo de Dependencias).
 *
 * Espejo de la tabla `department_requests` (`db/06-department-requests.sql`).
 * Es un módulo independiente de las dependencias 🆘 de iniciativa
 * (`initiative_dependencies`): no comparte tabla ni servicio con ellas y su
 * indicador de bloqueo es solo informativo (no toca `is_blocked` ni el SLE).
 */

export const DEPARTMENT_REQUEST_STATUSES = ['PENDING', 'IN_PROGRESS', 'RESOLVED'] as const;
export type DepartmentRequestStatus = (typeof DEPARTMENT_REQUEST_STATUSES)[number];

/** Tipos de necesidad admitidos: el mismo conjunto vigente que las dependencias de iniciativa. */
export const DEPARTMENT_REQUEST_HELP_TYPES = HELP_TYPES_V1;

export interface DepartmentRequest {
  id: string;
  title: string;
  description: string;
  sourceDepartment: Department;
  targetDepartment: Department;
  requestedBy: string;
  helpType: HelpType;
  status: DepartmentRequestStatus;
  /** Informativo: nunca escribe `is_blocked` ni altera el SLE de la iniciativa. */
  blocksInitiative: boolean;
  /** Iniciativa TEMO-XXX opcional, solo como contexto. */
  initiativeId: string | null;
  /**
   * Spec 004: persona concreta del área destino a la que va dirigida (`NULL` =
   * a toda el área). Solo cuenta mientras siga siendo elegible: ver `effectiveTargetUserId`.
   */
  targetUserId: string | null;
  /** Persona del área destino que la tomó; obligatoria desde `IN_PROGRESS`. */
  assigneeId: string | null;
  resolutionNotes: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

// --- Ampliación A: adjuntos y enlaces (spec 001 §13) ------------------------------

/** A qué parte pertenece el adjunto: lo que se pidió o lo que se respondió. */
export const ATTACHMENT_SIDES = ['REQUEST', 'RESPONSE'] as const;
export type AttachmentSide = (typeof ATTACHMENT_SIDES)[number];

export const ATTACHMENT_KINDS = ['FILE', 'LINK'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

interface AttachmentBase {
  id: string;
  requestId: string;
  side: AttachmentSide;
  addedBy: string;
  addedAt: string;
  /** Baja lógica (ampliación B, AGENTS.md §5.8): deja de mostrarse y de servirse, pero no se borra. */
  isRemoved: boolean;
  removedBy: string | null;
  removedAt: string | null;
}

/** Archivo en el almacenamiento privado: solo se guarda su clave, nunca una URL pública. */
export interface RequestFileAttachment extends AttachmentBase {
  kind: 'FILE';
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
}

/** Enlace externo `https://` con nombre. */
export interface RequestLinkAttachment extends AttachmentBase {
  kind: 'LINK';
  label: string;
  url: string;
}

/** Espejo de `department_request_attachments` (`db/07`). */
export type DepartmentRequestAttachment = RequestFileAttachment | RequestLinkAttachment;

// --- Spec 004: peticiones dirigidas a una persona -----------------------------------

type TargetCandidate = Pick<User, 'id' | 'isActive' | 'isAnonymized' | 'departments'>;

/** Puede recibir (o seguir recibiendo) una petición en `department`: activa, no anonimizada y de esa área. */
export function isEligibleRequestTarget(user: TargetCandidate, department: Department): boolean {
  return user.isActive && !user.isAnonymized && user.departments.includes(department);
}

/**
 * Destinatario que cuenta ahora mismo. Si la persona se dio de baja, se
 * anonimizó o ya no lleva el área destino, la petición vuelve a ser del área
 * (`null`). Se deriva al leer: la fila conserva `targetUserId` como historial.
 */
export function effectiveTargetUserId(
  request: Pick<DepartmentRequest, 'targetUserId' | 'targetDepartment'>,
  usersById: ReadonlyMap<string, TargetCandidate>,
): string | null {
  if (!request.targetUserId) return null;
  const user = usersById.get(request.targetUserId);
  return user && isEligibleRequestTarget(user, request.targetDepartment) ? user.id : null;
}

/** Una petición resuelta queda en solo lectura: no admite más transiciones. */
export function isDepartmentRequestClosed(request: Pick<DepartmentRequest, 'status'>): boolean {
  return request.status === 'RESOLVED';
}

/** Caracteres de control (incluido NUL): Postgres rechaza `\u0000` y `new URL` descarta tabuladores y saltos sin avisar. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

export function hasControlChars(value: string): boolean {
  return CONTROL_CHARS.test(value);
}

/**
 * Enlace que la base de datos va a aceptar: `https://` literal (el CHECK
 * `url LIKE 'https://%'` distingue mayúsculas y exige las dos barras), sin
 * credenciales ni caracteres de control. Validar lo mismo que la tabla evita
 * que un enlace acepte el servicio y rechace el INSERT después.
 */
export function isStorableHttpsUrl(value: string): boolean {
  if (!value.startsWith('https://') || hasControlChars(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
