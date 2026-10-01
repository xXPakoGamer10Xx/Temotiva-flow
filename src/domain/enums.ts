/**
 * Enums del dominio. Espejo exacto de los CREATE TYPE del DDL PostgreSQL
 * (TemoFlow.md, Bloque 4.1) mas las extensiones V1 declaradas en DESIGN.md §6.3.
 *
 * Identificadores en ingles; las etiquetas visibles en espanol viven en labels.ts.
 */

export const DEPARTMENTS = [
  'PRODUCT',
  'PSYCHOLOGY',
  'LEGAL',
  'DESIGN',
  'TECH',
  'QA',
  'CYBER',
  'HR',
  'FINANCE',
  'MARKETING',
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const PRIORITY_LEVELS = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const;
export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];

export const PRIORITY_REASONS = [
  'REGULATORY_RISK',
  'B2B_CLIENT',
  'SECURITY_INCIDENT',
  'ROADMAP',
  'INTERNAL_IMPROVEMENT',
] as const;
export type PriorityReason = (typeof PRIORITY_REASONS)[number];

/**
 * El DDL tolera REVIEW y UNBLOCK por compatibilidad futura, pero V1 solo ofrece
 * los cuatro tipos del documento funcional (DESIGN.md §6.3.4).
 */
export const HELP_TYPES = ['INFORMATION', 'VALIDATION', 'DECISION', 'RESOURCE', 'REVIEW', 'UNBLOCK'] as const;
export type HelpType = (typeof HELP_TYPES)[number];

export const HELP_TYPES_V1 = ['INFORMATION', 'VALIDATION', 'DECISION', 'RESOURCE'] as const satisfies readonly HelpType[];

export const HELP_STATUSES = ['PENDING', 'RESOLVED', 'REJECTED'] as const;
export type HelpStatus = (typeof HELP_STATUSES)[number];

/** Causas raiz de parada. Unico enum del DDL con valores en espanol; se respeta tal cual. */
export const STOP_REASONS = [
  'ESPERANDO_DECISION',
  'ESPERANDO_VALIDACION',
  'ESPERANDO_INFORMACION',
  'FALTA_CAPACIDAD',
  'BLOQUEO_TECNICO',
  'EXTERNO',
] as const;
export type StopReason = (typeof STOP_REASONS)[number];

export const USER_ROLES = ['MEMBER', 'LEAD', 'EXECUTIVE'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const STAGE_KEYS = ['IDEATION', 'FEASIBILITY', 'CO_DESIGN', 'READY', 'DEV', 'QA', 'PROD'] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export const ACTION_TYPES = [
  'INITIATIVE_CREATED',
  'STAGE_TRANSITION',
  'EXCEPTION_OVERRIDE',
  'DEPENDENCY_CREATED',
  'DEPENDENCY_RESOLVED',
  'DEPENDENCY_REJECTED',
  'BLOCKED_SET',
  'BLOCKED_CLEARED',
  'OWNER_REASSIGNED',
  'ASSIGNEE_CHANGED',
  'CHECKLIST_UPDATED',
  'INITIATIVE_UPDATED',
  'INITIATIVE_ARCHIVED',
  'INITIATIVE_RESTORED',
  'ACCESS_GRANTED',
  'ACCESS_UPDATED',
  'ACCESS_REVOKED',
  'ACCESS_ANONYMIZED',
  'PROFILE_UPDATED',
  'SYSTEM_SETTINGS_UPDATED',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const LINK_KINDS = ['FIGMA', 'NOTION', 'REPO', 'OTHER'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
