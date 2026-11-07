import type { Department, HelpType } from './enums';
import { HELP_TYPES_V1 } from './enums';

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
  /** Persona del área destino que la tomó; obligatoria desde `IN_PROGRESS`. */
  assigneeId: string | null;
  resolutionNotes: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

/** Una petición resuelta queda en solo lectura: no admite más transiciones. */
export function isDepartmentRequestClosed(request: Pick<DepartmentRequest, 'status'>): boolean {
  return request.status === 'RESOLVED';
}
