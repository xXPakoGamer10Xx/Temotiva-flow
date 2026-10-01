import type {
  ActionType,
  Department,
  HelpStatus,
  HelpType,
  LinkKind,
  PriorityLevel,
  PriorityReason,
  StopReason,
  UserRole,
} from './enums';

/**
 * Unica fuente de los textos visibles (AGENTS.md §4.1: codigo en ingles,
 * interfaz en espanol). Ningun componente escribe literales de enum.
 */

export const DEPARTMENT_LABELS: Record<Department, string> = {
  PRODUCT: 'Producto',
  PSYCHOLOGY: 'Psicología',
  LEGAL: 'Legal / DPO',
  DESIGN: 'Diseño',
  TECH: 'Tech',
  QA: 'QA',
  CYBER: 'Ciberseguridad',
  HR: 'RRHH',
  FINANCE: 'Finanzas',
  MARKETING: 'Marketing',
};

/** Forma corta para chips y tablas densas. */
export const DEPARTMENT_SHORT: Record<Department, string> = {
  PRODUCT: 'Producto',
  PSYCHOLOGY: 'Psico',
  LEGAL: 'Legal',
  DESIGN: 'Diseño',
  TECH: 'Tech',
  QA: 'QA',
  CYBER: 'Ciber',
  HR: 'RRHH',
  FINANCE: 'Finanzas',
  MARKETING: 'Marketing',
};

export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  LOW: 'Baja',
  NORMAL: 'Normal',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

export const PRIORITY_REASON_LABELS: Record<PriorityReason, string> = {
  REGULATORY_RISK: 'Riesgo regulatorio',
  B2B_CLIENT: 'Cliente B2B',
  SECURITY_INCIDENT: 'Incidencia de seguridad',
  ROADMAP: 'Roadmap',
  INTERNAL_IMPROVEMENT: 'Mejora interna',
};

export const PRIORITY_REASON_HINTS: Record<PriorityReason, string> = {
  REGULATORY_RISK: 'RGPD, requerimientos legales o sanitarios.',
  B2B_CLIENT: 'Compromiso contractual o cierre de cuenta enterprise.',
  SECURITY_INCIDENT: 'Vulnerabilidad o brecha técnica.',
  ROADMAP: 'Evolución planificada de producto.',
  INTERNAL_IMPROVEMENT: 'Eficiencia o refactorización operativa.',
};

export const HELP_TYPE_LABELS: Record<HelpType, string> = {
  INFORMATION: 'Información',
  VALIDATION: 'Validación',
  DECISION: 'Decisión',
  RESOURCE: 'Recurso',
  REVIEW: 'Revisión',
  UNBLOCK: 'Desbloqueo',
};

export const HELP_TYPE_HINTS: Record<HelpType, string> = {
  INFORMATION: 'Necesidad de contexto o datos.',
  VALIDATION: 'Firma o revisión clínica/legal.',
  DECISION: 'Dilema de producto o directivo pendiente de resolución.',
  RESOURCE: 'Acceso, entorno, API o activo de diseño.',
  REVIEW: 'Revisión de trabajo entregado.',
  UNBLOCK: 'Levantar un impedimento técnico.',
};

export const HELP_STATUS_LABELS: Record<HelpStatus, string> = {
  PENDING: 'Pendiente',
  RESOLVED: 'Resuelta',
  REJECTED: 'Rechazada',
};

export const STOP_REASON_LABELS: Record<StopReason, string> = {
  ESPERANDO_DECISION: 'Esperando decisión',
  ESPERANDO_VALIDACION: 'Esperando validación',
  ESPERANDO_INFORMACION: 'Esperando información',
  FALTA_CAPACIDAD: 'Falta de capacidad',
  BLOQUEO_TECNICO: 'Bloqueo técnico',
  EXTERNO: 'Causa externa',
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  MEMBER: 'Miembro',
  LEAD: 'Responsable de área',
  EXECUTIVE: 'Dirección',
};

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  INITIATIVE_CREATED: 'Iniciativa creada',
  STAGE_TRANSITION: 'Cambio de fase',
  EXCEPTION_OVERRIDE: 'Avance excepcional',
  DEPENDENCY_CREATED: 'Solicitud de ayuda abierta',
  DEPENDENCY_RESOLVED: 'Solicitud de ayuda resuelta',
  DEPENDENCY_REJECTED: 'Solicitud de ayuda rechazada',
  BLOCKED_SET: 'Parada activada',
  BLOCKED_CLEARED: 'Parada levantada',
  OWNER_REASSIGNED: 'Propietario reasignado',
  ASSIGNEE_CHANGED: 'Responsable individual asignado',
  CHECKLIST_UPDATED: 'Compuerta actualizada',
  INITIATIVE_UPDATED: 'Iniciativa editada',
  INITIATIVE_ARCHIVED: 'Iniciativa archivada',
  INITIATIVE_RESTORED: 'Iniciativa restaurada',
  ACCESS_GRANTED: 'Acceso concedido',
  ACCESS_UPDATED: 'Perfil de acceso modificado',
  ACCESS_REVOKED: 'Acceso revocado',
  ACCESS_ANONYMIZED: 'Perfil anonimizado',
  PROFILE_UPDATED: 'Perfil actualizado',
  SYSTEM_SETTINGS_UPDATED: 'Parámetros del sistema modificados',
};

export const LINK_KIND_LABELS: Record<LinkKind, string> = {
  FIGMA: 'Figma',
  NOTION: 'Notion',
  REPO: 'Repositorio',
  OTHER: 'Enlace',
};

/** "Legal / DPO" con una sola área; "RRHH · Finanzas" cuando hay varias. */
export function departmentsLabel(departments: Department[]): string {
  const [first] = departments;
  if (!first) return '—';
  if (departments.length === 1) return DEPARTMENT_LABELS[first];
  return departments.map((department) => DEPARTMENT_SHORT[department]).join(' · ');
}

/** Etiqueta compacta de tarjeta: "Alta · Cliente B2B". */
export function priorityBadgeLabel(priority: PriorityLevel, reason: PriorityReason): string {
  return PRIORITY_LABELS[priority] + ' · ' + PRIORITY_REASON_LABELS[reason];
}
