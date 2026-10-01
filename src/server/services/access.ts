import { randomUUID } from 'node:crypto';
import type { Department, UserRole } from '@/domain/enums';
import type { SessionContext, User } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { audit } from './audit';
import { invalid, invalidState, notFound } from './errors';
import {
  assertPermission,
  canAnonymizeUser,
  canGrantAccess,
  canManagePeople,
  canManageUser,
} from './rbac';

/**
 * Gestión de personas y allowlist de acceso (SEGURIDAD.md §3.2).
 *
 * El equipo trabaja con cuentas de Google propias, así que el dominio del
 * correo no autoriza nada: autoriza estar dado de alta aquí y activo. Esta es
 * la única puerta de entrada al sistema.
 *
 * Las altas siguen una jerarquía descendente: Dirección da de alta a cualquiera
 * (incluidos responsables), cada responsable suma miembros dentro de las áreas
 * que lleva, y quien es miembro no da de alta a nadie. Toda alta, modificación
 * y baja queda registrada en la caja negra como evento de sistema.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const MIN_PERSON_NAME = 3;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Sin áreas no hay permisos posibles: la lista nunca puede quedar vacía. */
function normalizeDepartments(departments: Department[]): Department[] {
  const unique = [...new Set(departments)];
  if (unique.length === 0) throw invalid('Asigna al menos un área a la persona.');
  return unique;
}

export interface GrantAccessInput {
  name: string;
  email: string;
  departments: Department[];
  role: UserRole;
}

export async function grantAccess(
  store: DataStore,
  session: SessionContext,
  input: GrantAccessInput,
): Promise<User> {
  assertPermission(canManagePeople(session), 'Tu rol no puede dar acceso a otras personas.');

  const departments = normalizeDepartments(input.departments);
  assertPermission(
    canGrantAccess(session, { role: input.role, departments }),
    'Solo puedes dar de alta a miembros de las áreas que llevas.',
  );

  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!EMAIL_PATTERN.test(email)) throw invalid('El correo no tiene un formato válido.');
  if (name.length < MIN_PERSON_NAME) throw invalid('Indica el nombre completo de la persona.');

  const existing = await store.userByEmail(email);
  if (existing) {
    // Reactivar en lugar de duplicar: el historial de la persona se conserva.
    assertPermission(canManageUser(session, existing), 'Esa persona está fuera de tu alcance de gestión.');
    if (existing.isAnonymized) {
      throw invalidState('Ese perfil fue anonimizado y no puede reutilizarse. Da de alta un correo nuevo.');
    }

    const reactivated = await store.updateUser(existing.id, {
      name,
      departments,
      role: input.role,
      isActive: true,
    });
    await audit(store, {
      initiativeId: null,
      session,
      actionType: 'ACCESS_UPDATED',
      fieldName: 'users',
      // El log referencia a la persona por su `userId`, nunca por su correo:
      // así la anonimización posterior puede borrar el correo de verdad sin
      // dejar copias en eventos que son inmutables (SEGURIDAD.md §5.3).
      oldValue: {
        userId: existing.id,
        role: existing.role,
        departments: existing.departments,
        isActive: existing.isActive,
      },
      newValue: { userId: existing.id, role: input.role, departments, isActive: true },
    });
    return reactivated;
  }

  const user: User = {
    id: randomUUID(),
    name,
    email,
    departments,
    role: input.role,
    isActive: true,
    isAnonymized: false,
    createdAt: new Date().toISOString(),
  };

  await store.insertUser(user);
  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'ACCESS_GRANTED',
    fieldName: 'users',
    newValue: { userId: user.id, role: user.role, departments: user.departments },
  });

  return user;
}

async function loadUser(store: DataStore, userId: string): Promise<User> {
  const user = await store.userById(userId);
  if (!user) throw notFound('La persona indicada no existe.');
  return user;
}

export interface UpdateAccessInput {
  userId: string;
  name?: string;
  departments?: Department[];
  role?: UserRole;
}

export async function updateAccess(
  store: DataStore,
  session: SessionContext,
  input: UpdateAccessInput,
): Promise<User> {
  assertPermission(canManagePeople(session), 'Tu rol no puede modificar perfiles de acceso.');

  const user = await loadUser(store, input.userId);
  assertPermission(canManageUser(session, user), 'Esa persona está fuera de tu alcance de gestión.');

  const departments = input.departments ? normalizeDepartments(input.departments) : user.departments;
  const role = input.role ?? user.role;

  // Quien edita tiene que poder otorgar también el resultado: así un responsable
  // no puede ascender a nadie ni moverlo a un área que no lleva.
  assertPermission(
    canGrantAccess(session, { role, departments }),
    'No puedes otorgar un rol o un área que no están a tu alcance.',
  );

  if (user.id === session.userId && role !== user.role) {
    throw invalid('No puedes cambiarte el rol a ti mismo.');
  }

  const name = input.name?.trim() ?? user.name;
  if (name.length < MIN_PERSON_NAME) throw invalid('Indica el nombre completo de la persona.');

  // Guardar el perfil sin tocar nada no es un evento: llenaba la caja negra de
  // entradas con `old == new`.
  const sameDepartments =
    departments.length === user.departments.length &&
    departments.every((department) => user.departments.includes(department));
  if (name === user.name && role === user.role && sameDepartments) return user;

  const updated = await store.updateUser(user.id, { name, departments, role });

  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'ACCESS_UPDATED',
    fieldName: 'users',
    oldValue: { userId: user.id, role: user.role, departments: user.departments, name: user.name },
    newValue: { userId: user.id, role: updated.role, departments: updated.departments, name: updated.name },
  });

  return updated;
}

/** Baja lógica: fail-closed inmediato en la próxima petición. */
export async function setAccessActive(
  store: DataStore,
  session: SessionContext,
  input: { userId: string; isActive: boolean },
): Promise<User> {
  assertPermission(canManagePeople(session), 'Tu rol no puede dar de baja a otras personas.');

  const user = await loadUser(store, input.userId);
  assertPermission(canManageUser(session, user), 'Esa persona está fuera de tu alcance de gestión.');

  if (user.id === session.userId && !input.isActive) {
    throw invalid('No puedes revocar tu propio acceso.');
  }
  if (user.isAnonymized && input.isActive) {
    throw invalidState('Un perfil anonimizado no puede reactivarse.');
  }

  const updated = await store.updateUser(user.id, { isActive: input.isActive });

  await audit(store, {
    initiativeId: null,
    session,
    actionType: input.isActive ? 'ACCESS_GRANTED' : 'ACCESS_REVOKED',
    fieldName: 'is_active',
    oldValue: { userId: user.id, isActive: user.isActive },
    newValue: { userId: user.id, isActive: input.isActive },
  });

  return updated;
}

/**
 * Anonimización (RGPD, derecho de supresión — SEGURIDAD.md §5.3).
 *
 * Sustituye nombre y correo por un identificador opaco y deja la fila en su
 * sitio: los eventos que esa persona firmó siguen atribuidos a un sujeto
 * estable, de modo que la caja negra no pierde el hilo de quién autorizó qué.
 * Es irreversible y competencia exclusiva de Dirección.
 */
export async function anonymizeUser(
  store: DataStore,
  session: SessionContext,
  input: { userId: string; reason: string },
): Promise<User> {
  assertPermission(canAnonymizeUser(session), 'Solo Dirección puede anonimizar un perfil.');

  const user = await loadUser(store, input.userId);
  if (user.id === session.userId) throw invalid('No puedes anonimizar tu propio perfil.');
  if (user.isAnonymized) throw invalidState('Ese perfil ya estaba anonimizado.');
  if (user.isActive) {
    throw invalidState('Revoca primero el acceso: solo se anonimiza a quien ya está de baja.');
  }

  const reason = input.reason.trim();
  if (reason.length < 10) throw invalid('Indica el motivo de la anonimización (mínimo 10 caracteres).');

  // Token aleatorio, no derivado del identificador: el `userId` se conserva a
  // propósito para que la caja negra siga atribuyendo sus firmas, pero el
  // nombre visible no tiene por qué dar pistas de a qué fila corresponde.
  const token = randomUUID().slice(0, 8);
  const updated = await store.updateUser(user.id, {
    name: `Persona anonimizada ${token}`,
    email: `anon-${token}@anonimizado.local`,
    isActive: false,
    isAnonymized: true,
  });

  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'ACCESS_ANONYMIZED',
    fieldName: 'users',
    // El correo original no se copia al log: anonimizar y dejarlo escrito al
    // lado sería no anonimizar nada.
    oldValue: { userId: user.id },
    newValue: { userId: user.id, reason },
  });

  return updated;
}

/**
 * Panel de cuenta propia: cualquier rol puede corregir su nombre visible.
 *
 * El correo no se toca aquí porque es la llave de acceso: cambiarlo equivale a
 * dar acceso a otra cuenta de Google, y eso pasa por quien gestiona el equipo.
 * La contraseña tampoco, porque no existe: la custodia Google (D2).
 */
export async function updateOwnProfile(
  store: DataStore,
  session: SessionContext,
  input: { name: string },
): Promise<User> {
  const user = await loadUser(store, session.userId);
  const name = input.name.trim();
  if (name.length < MIN_PERSON_NAME) throw invalid('El nombre debe tener al menos 3 caracteres.');
  if (name === user.name) return user;

  const updated = await store.updateUser(user.id, { name });

  await audit(store, {
    initiativeId: null,
    session,
    actionType: 'PROFILE_UPDATED',
    fieldName: 'name',
    oldValue: { name: user.name },
    newValue: { name },
  });

  return updated;
}
