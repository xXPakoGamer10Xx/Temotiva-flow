import type {
  ActionType,
  Department,
  HelpStatus,
  HelpType,
  LinkKind,
  PriorityLevel,
  PriorityReason,
  StageKey,
  StopReason,
  UserRole,
} from './enums';

/**
 * Entidades del dominio. Cada interfaz mapea 1:1 a una tabla del DDL
 * (TemoFlow.md Bloque 4.1). Las columnas snake_case del SQL se exponen en
 * camelCase; los TIMESTAMPTZ viajan como ISO-8601 en string para poder
 * serializarse de Server Components a componentes cliente sin perdida.
 */

/**
 * Tabla `users` + `user_departments`.
 *
 * Extensiones V1: `is_active` (allowlist de acceso, SEGURIDAD.md §3.2) y
 * **varias áreas por persona**: un responsable puede llevar más de un
 * departamento a la vez (RRHH y Finanzas, o Tech y Ciberseguridad). La lista
 * nunca está vacía y su primer elemento es el área principal, la que se muestra
 * cuando solo cabe una.
 */
export interface User {
  id: string;
  name: string;
  email: string;
  departments: Department[];
  role: UserRole;
  isActive: boolean;
  /** Perfil anonimizado por derecho de supresión: se conserva la fila y su historial. */
  isAnonymized: boolean;
  createdAt: string;
}

/** Área principal: la que representa a la persona cuando solo cabe una. */
export function primaryDepartment(user: Pick<User, 'departments'>): Department {
  return user.departments[0] ?? 'PRODUCT';
}

/** Tabla `workflow_stages`. */
export interface WorkflowStage {
  id: number;
  key: StageKey;
  name: string;
  orderIndex: number;
  defaultOwnerDepartment: Department;
  sleHours: number;
  wipLimit: number;
  isActive: boolean;
  /** Proposito de la fase (TemoFlow.md §1.2). Solo informativo en la UI. */
  purpose: string;
}

/**
 * Tabla `stage_checklists`.
 * Extension V1: `responsible_department`, necesaria para que el panel de
 * compuerta pueda ofrecer "Solicitar a Departamento Responsable" en un clic
 * (TemoFlow.md §1.3).
 */
export interface StageChecklistItem {
  id: string;
  stageId: number;
  label: string;
  description: string | null;
  orderIndex: number;
  isMandatory: boolean;
  responsibleDepartment: Department;
  createdAt: string;
}

/** Enlace externo de una iniciativa (Figma / Notion / repositorio). */
export interface InitiativeLink {
  kind: LinkKind;
  label: string;
  url: string;
}

/**
 * Tabla `initiatives`. Extensiones V1 sobre el DDL original:
 * `is_archived`, `current_task`, `links`, `blocked_since`, `blocked_ms_in_stage`.
 */
export interface Initiative {
  id: string;
  title: string;
  description: string;
  priority: PriorityLevel;
  priorityReason: PriorityReason;
  currentStageId: number;
  ownerDepartment: Department;
  currentAssigneeId: string | null;
  createdBy: string;

  // ---------------------------------------------------------------------------
  // Control de parada.
  //
  // Una parada tiene dos orígenes posibles y pueden coexistir: la declarada a
  // mano y la inducida por dependencias bloqueantes pendientes. Por eso el
  // origen manual se guarda aparte: si se resuelve la última dependencia pero
  // la causa manual sigue viva, la iniciativa debe seguir parada.
  //
  // `isBlocked`, `stopReason` y `blockedDescription` son el estado *efectivo*,
  // recalculado a partir de ambos orígenes.
  // ---------------------------------------------------------------------------
  isBlocked: boolean;
  stopReason: StopReason | null;
  blockedDescription: string | null;
  /** Causa declarada a mano; solo se levanta a mano. */
  manualStopReason: StopReason | null;
  manualStopDescription: string | null;
  /**
   * Ancla de contabilidad: instante en que arrancó el tramo de parada **en la
   * fase actual**. Se reinicia al cambiar de fase para que el SLE neto de cada
   * fase solo descuente el tiempo parado dentro de ella.
   */
  blockedSince: string | null;
  /**
   * Instante en que empezó la parada actual, cruzando fases. Solo para mostrar
   * y medir ("lleva 3 días parada"); nunca entra en el cálculo del SLE.
   */
  blockedStartedAt: string | null;
  /** Tiempo bloqueado ya consolidado en la fase actual, en ms. Base del SLE neto. */
  blockedMsInStage: number;

  /** Tarea en curso declarada por el propietario (columna del Radar de Esperas). */
  currentTask: string | null;
  links: InitiativeLink[];

  isArchived: boolean;
  stageEnteredAt: string;
  createdAt: string;
  updatedAt: string;
}

/** Tabla `initiative_checklist_values` (clave compuesta iniciativa + item). */
export interface ChecklistValue {
  initiativeId: string;
  checklistId: string;
  isCompleted: boolean;
  completedBy: string | null;
  completedAt: string | null;
}

/** Tabla `initiative_dependencies` — solicitudes de ayuda 🆘. */
export interface Dependency {
  id: string;
  initiativeId: string;
  requestedBy: string;
  targetDepartment: Department;
  helpType: HelpType;
  isBlocking: boolean;
  description: string;
  /**
   * Requisito de compuerta que originó la petición, cuando nace del panel de
   * pendientes. Extensión V1: permite saber si un pendiente concreto ya está
   * solicitado, en vez de dar por cubierto todo el departamento.
   */
  checklistItemId: string | null;
  status: HelpStatus;
  resolutionNotes: string | null;
  resolvedBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Metadata de no repudio de un avance excepcional (TemoFlow.md §2.2). */
export interface OverrideMetadata {
  reason: string;
  riskAccepted: string;
  authorizedBy: string;
  authorizedByEmail: string;
  authorizedByRole: UserRole;
  pendingItems: { id: string; label: string; responsibleDepartment: Department }[];
  signature: string;
  ip: string | null;
  ipChain?: string | null;
  userAgent: string | null;
  [key: string]: JsonValue | undefined;
}

/**
 * Tabla `activity_log` — la caja negra. Append-only: nunca se actualiza ni se borra.
 * Extension V1: `initiative_id` admite NULL para eventos de sistema que no
 * cuelgan de ninguna iniciativa (altas y bajas de la allowlist de acceso).
 */
export interface ActivityLogEntry {
  readonly id: string;
  readonly initiativeId: string | null;
  readonly userId: string;
  readonly actionType: ActionType;
  readonly fromStageId: number | null;
  readonly toStageId: number | null;
  readonly fieldName: string | null;
  readonly oldValue: JsonValue | null;
  readonly newValue: JsonValue | null;
  readonly overrideMetadata: OverrideMetadata | null;
  readonly createdAt: string;
}

/**
 * Contexto de sesion de confianza. Se construye SIEMPRE en el servidor a
 * partir de `auth()`; jamas con parametros enviados por el cliente
 * (SEGURIDAD.md §3.3).
 */
export interface SessionContext {
  userId: string;
  email: string;
  name: string;
  /** Todas las áreas de la persona; manda la pertenencia, no el orden. */
  departments: Department[];
  role: UserRole;
}

/** ¿La sesión pertenece a esta área? Toda comprobación de área pasa por aquí. */
export function belongsTo(session: SessionContext, department: Department): boolean {
  return session.departments.includes(department);
}

/** Datos de la peticion HTTP que acompanan a una firma de excepcion. */
export interface RequestContext {
  /** Salto de confianza más cercano al servidor, no el que declara el cliente. */
  ip: string | null;
  /** Cadena completa de `x-forwarded-for` cuando hay más de un salto. */
  ipChain?: string | null;
  userAgent: string | null;
}
