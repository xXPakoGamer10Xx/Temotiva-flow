import type { Department } from '@/domain/enums';
import type { Initiative, SessionContext, StageChecklistItem } from '@/domain/types';
import { forbidden } from './errors';

/**
 * Matriz de permisos (DESIGN.md §8.2 / TemoFlow.md §2.1) como predicados puros.
 *
 * Regla de oro: esta matriz se evalúa SIEMPRE en el servidor. La interfaz solo
 * oculta botones; nunca es la frontera de seguridad (SEGURIDAD.md §1.7).
 */

const isExecutive = (session: SessionContext): boolean => session.role === 'EXECUTIVE';
const isLeadOf = (session: SessionContext, department: Department): boolean =>
  session.role === 'LEAD' && session.department === department;

/** Avance excepcional: LEAD sobre su área, EXECUTIVE sobre todo. */
export function canOverrideGate(session: SessionContext, initiative: Initiative): boolean {
  return isExecutive(session) || isLeadOf(session, initiative.ownerDepartment);
}

/** Reasignar propiedad: LEAD del departamento actual o del destino, o EXECUTIVE. */
export function canReassignOwner(
  session: SessionContext,
  initiative: Initiative,
  targetDepartment: Department,
): boolean {
  return (
    isExecutive(session) || isLeadOf(session, initiative.ownerDepartment) || isLeadOf(session, targetDepartment)
  );
}

/** Archivar (soft-delete): LEAD sobre su área, EXECUTIVE sobre todo. */
export function canArchiveInitiative(session: SessionContext, initiative: Initiative): boolean {
  return isExecutive(session) || isLeadOf(session, initiative.ownerDepartment);
}

/**
 * Marcar un item de compuerta: solo el departamento responsable del item
 * (Dirección puede sobre cualquiera, por su rol de cierre).
 */
export function canToggleChecklistItem(session: SessionContext, item: StageChecklistItem): boolean {
  return isExecutive(session) || session.department === item.responsibleDepartment;
}

/** Configurar los items de compuerta de su área: LEAD o EXECUTIVE. */
export function canConfigureChecklistItem(session: SessionContext, responsible: Department): boolean {
  return isExecutive(session) || isLeadOf(session, responsible);
}

/** Cambiar límites de WIP y objetivos de SLE del sistema: solo EXECUTIVE. */
export function canConfigureSystem(session: SessionContext): boolean {
  return isExecutive(session);
}

/** Gestionar la allowlist de acceso (altas, bajas, rol y departamento): solo EXECUTIVE. */
export function canManageAccess(session: SessionContext): boolean {
  return isExecutive(session);
}

/** Lanza `FORBIDDEN` con el texto que verá la persona si el permiso no se cumple. */
export function assertPermission(allowed: boolean, message: string): void {
  if (!allowed) throw forbidden(message);
}
