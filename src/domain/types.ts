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

/** Tabla `users`. Extension V1: `is_active` (allowlist de acceso, ver SEGURIDAD.md §3.2). */
export interface User {
  id: string;
  name: string;
  email: string;
  department: Department;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
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

  // Control de parada / bloqueo
  isBlocked: boolean;
  stopReason: StopReason | null;
  blockedDescription: string | null;
  /** Instante en que arranco el bloqueo vigente (null si no esta bloqueada). */
  blockedSince: string | null;
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
  department: Department;
  role: UserRole;
}

/** Datos de la peticion HTTP que acompanan a una firma de excepcion. */
export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}
