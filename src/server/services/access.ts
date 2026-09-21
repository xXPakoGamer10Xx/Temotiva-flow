import { randomUUID } from 'node:crypto';
import type { Department, UserRole } from '@/domain/enums';
import type { SessionContext, User } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { invalid, notFound } from './errors';
import { assertPermission, canManageAccess } from './rbac';

/**
 * Allowlist de acceso (SEGURIDAD.md §3.2).
 *
 * El equipo trabaja con cuentas de Google propias, así que el dominio del
 * correo no autoriza nada: autoriza estar dado de alta aquí y activo. Esta es
 * la única puerta de entrada al sistema, y solo Dirección la administra.
 *
 * Toda alta, modificación y baja queda registrada en la caja negra como evento
 * de sistema (sin iniciativa asociada).
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface GrantAccessInput {
  name: string;
  email: string;
  department: Department;
  role: UserRole;
}

export async function grantAccess(
  store: DataStore,
  session: SessionContext,
  input: GrantAccessInput,
): Promise<User> {
  assertPermission(canManageAccess(session), 'Solo Dirección puede dar acceso al sistema.');

  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!EMAIL_PATTERN.test(email)) throw invalid('El correo no tiene un formato válido.');
  if (name.length < 3) throw invalid('Indica el nombre completo de la persona.');

  const existing = await store.userByEmail(email);
  if (existing) {
    // Reactivar en lugar de duplicar: el historial de la persona se conserva.
    const reactivated = await store.updateUser(existing.id, {
      name,
      department: input.department,
      role: input.role,
      isActive: true,
    });
    await audit(store, {
      initiativeId: null,
      session,
      actionType: 'ACCESS_UPDATED',
      fieldName: 'users',
      oldValue: { email: existing.email, role: existing.role, department: existing.department, isActive: existing.isActive },
      newValue: { email, role: input.role, department: input.department, isActive: true },
    });
    return reactivated;
  }

  const user: User = {
    id: randomUUID(),
    name,
    email,
    department: input.department,
    role: input.role,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  await store.insertUser(user);
  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'ACCESS_GRANTED',
    fieldName: 'users',
    newValue: { email: user.email, role: user.role, department: user.department },
  });

  return user;
}

export async function updateAccess(
  store: DataStore,
  session: SessionContext,
  input: { userId: string; department?: Department; role?: UserRole },
): Promise<User> {
  assertPermission(canManageAccess(session), 'Solo Dirección puede modificar los perfiles de acceso.');

  const user = await store.userById(input.userId);
  if (!user) throw notFound('La persona indicada no existe.');

  const updated = await store.updateUser(user.id, {
    department: input.department ?? user.department,
    role: input.role ?? user.role,
  });

  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'ACCESS_UPDATED',
    fieldName: 'users',
    oldValue: { email: user.email, role: user.role, department: user.department },
    newValue: { email: updated.email, role: updated.role, department: updated.department },
  });

  return updated;
}

/** Baja lógica: fail-closed inmediato en el próximo inicio de sesión. */
export async function setAccessActive(
  store: DataStore,
  session: SessionContext,
  input: { userId: string; isActive: boolean },
): Promise<User> {
  assertPermission(canManageAccess(session), 'Solo Dirección puede revocar accesos.');

  const user = await store.userById(input.userId);
  if (!user) throw notFound('La persona indicada no existe.');
  if (user.id === session.userId && !input.isActive) {
    throw invalid('No puedes revocar tu propio acceso.');
  }

  const updated = await store.updateUser(user.id, { isActive: input.isActive });

  await audit(store, {
    initiativeId: null,
    session,
    actionType: input.isActive ? 'ACCESS_GRANTED' : 'ACCESS_REVOKED',
    fieldName: 'is_active',
    oldValue: { email: user.email, isActive: user.isActive },
    newValue: { email: user.email, isActive: input.isActive },
  });

  return updated;
}
