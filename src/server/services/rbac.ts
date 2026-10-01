import type { Department, UserRole } from '@/domain/enums';
import type { Initiative, SessionContext, StageChecklistItem, User } from '@/domain/types';
import { belongsTo } from '@/domain/types';
import { forbidden } from './errors';

/**
 * Matriz de permisos (DESIGN.md §8.2 / TemoFlow.md §2.1) como predicados puros.
 *
 * Regla de oro: esta matriz se evalúa SIEMPRE en el servidor. La interfaz solo
 * oculta botones; nunca es la frontera de seguridad (SEGURIDAD.md §1.7).
 *
 * Una persona puede pertenecer a varias áreas, así que "su área" significa
 * "cualquiera de las suyas".
 */

const isExecutive = (session: SessionContext): boolean => session.role === 'EXECUTIVE';

/** LEAD de un área concreta (con multi-área, basta con que la lleve entre las suyas). */
const isLeadOf = (session: SessionContext, department: Department): boolean =>
  session.role === 'LEAD' && belongsTo(session, department);

/**
 * Pertenencia al trabajo: el área propietaria de la fase actual, o Dirección.
 *
 * La matriz de TemoFlow.md §2.1 abre avanzar fase, asignar y declarar parada a
 * los tres roles **a propósito**: no es una capacidad de jerarquía, es de
 * oficio. Lo que no dice la matriz —y sin ello cualquiera podría mover la
 * iniciativa de otro departamento— es que hay que estar en el área que tiene el
 * trabajo. Ese es el ámbito que fija este predicado.
 */
export function worksOnInitiative(session: SessionContext, initiative: Initiative): boolean {
  return isExecutive(session) || belongsTo(session, initiative.ownerDepartment);
}

/** Avanzar de fase: el área propietaria (cualquier rol) o Dirección. */
export function canAdvanceInitiative(session: SessionContext, initiative: Initiative): boolean {
  return worksOnInitiative(session, initiative);
}

/** Asignar la persona responsable dentro de la fase: el área propietaria o Dirección. */
export function canAssignInitiative(session: SessionContext, initiative: Initiative): boolean {
  return worksOnInitiative(session, initiative);
}

/** Declarar o levantar una parada: el área propietaria, que es quien tiene el trabajo. */
export function canBlockInitiative(session: SessionContext, initiative: Initiative): boolean {
  return worksOnInitiative(session, initiative);
}

/**
 * Cambiar la prioridad y su motivo.
 *
 * No es un campo descriptivo: decide el orden de trabajo de otros
 * departamentos, así que lo mueve quien responde del área, no cualquiera.
 */
export function canChangePriority(session: SessionContext, initiative: Initiative): boolean {
  return isExecutive(session) || isLeadOf(session, initiative.ownerDepartment);
}

/** Avance excepcional: LEAD sobre sus áreas, EXECUTIVE sobre todo. */
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

/** Archivar (soft-delete): LEAD sobre sus áreas, EXECUTIVE sobre todo. */
export function canArchiveInitiative(session: SessionContext, initiative: Initiative): boolean {
  return isExecutive(session) || isLeadOf(session, initiative.ownerDepartment);
}

/**
 * Marcar un item de compuerta: solo el departamento responsable del item
 * (Dirección puede sobre cualquiera, por su rol de cierre).
 */
export function canToggleChecklistItem(session: SessionContext, item: StageChecklistItem): boolean {
  return isExecutive(session) || belongsTo(session, item.responsibleDepartment);
}

/** Configurar los items de compuerta de sus áreas: LEAD o EXECUTIVE. */
export function canConfigureChecklistItem(session: SessionContext, responsible: Department): boolean {
  return isExecutive(session) || isLeadOf(session, responsible);
}

/** Cambiar límites de WIP y objetivos de SLE del sistema: solo EXECUTIVE. */
export function canConfigureSystem(session: SessionContext): boolean {
  return isExecutive(session);
}

// ---------------------------------------------------------------------------
// Gestión de personas: jerarquía descendente (DESIGN.md §8.3)
//
//   EXECUTIVE  → cualquier persona, cualquier rol, cualquier área.
//   LEAD       → solo MIEMBROS, y solo dentro de las áreas que lleva.
//   MEMBER     → nadie; únicamente su propia cuenta.
//
// Nadie puede otorgar lo que no tiene: un responsable no crea responsables ni
// se añade áreas a sí mismo.
// ---------------------------------------------------------------------------

/** ¿Puede esta sesión abrir la vista de equipo? */
export function canManagePeople(session: SessionContext): boolean {
  return session.role !== 'MEMBER';
}

/** Alcance de gestión: `'ALL'` para Dirección, o la lista de áreas del responsable. */
export function managementScope(session: SessionContext): 'ALL' | Department[] {
  if (isExecutive(session)) return 'ALL';
  return session.role === 'LEAD' ? session.departments : [];
}

/** Roles que esta sesión puede otorgar. */
export function assignableRoles(session: SessionContext): UserRole[] {
  if (isExecutive(session)) return ['MEMBER', 'LEAD', 'EXECUTIVE'];
  return session.role === 'LEAD' ? ['MEMBER'] : [];
}

function coversAll(session: SessionContext, departments: Department[]): boolean {
  return departments.length > 0 && departments.every((department) => belongsTo(session, department));
}

/** ¿Puede dar de alta a alguien con este rol y estas áreas? */
export function canGrantAccess(
  session: SessionContext,
  input: { role: UserRole; departments: Department[] },
): boolean {
  if (isExecutive(session)) return input.departments.length > 0;
  if (session.role !== 'LEAD') return false;
  // Un responsable solo suma miembros, y solo dentro de lo que ya lleva.
  return input.role === 'MEMBER' && coversAll(session, input.departments);
}

/**
 * ¿Puede tocar el perfil de acceso de esta persona (rol, áreas, alta y baja)?
 *
 * El responsable necesita cubrir **todas** las áreas de quien edita: si alguien
 * pertenece a Tech y a Finanzas, quien solo lleva Tech no decide por esa persona.
 */
export function canManageUser(session: SessionContext, target: Pick<User, 'role' | 'departments'>): boolean {
  if (isExecutive(session)) return true;
  if (session.role !== 'LEAD') return false;
  return target.role === 'MEMBER' && coversAll(session, target.departments);
}

/** Anonimizar un perfil (derecho de supresión) es competencia exclusiva de Dirección. */
export function canAnonymizeUser(session: SessionContext): boolean {
  return isExecutive(session);
}

/** Lanza `FORBIDDEN` con el texto que verá la persona si el permiso no se cumple. */
export function assertPermission(allowed: boolean, message: string): void {
  if (!allowed) throw forbidden(message);
}
