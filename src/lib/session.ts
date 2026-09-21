import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { RequestContext, SessionContext } from '@/domain/types';
import { auth } from './auth';
import { getDataStore } from '@/server/repositories';

/**
 * Contexto de confianza del servidor.
 *
 * Toda Server Action y todo Server Component arranca por aquí: la sesión se lee
 * con `auth()` (nunca `getSession()`, DESIGN.md §4) y se revalida contra la
 * allowlist antes de devolverla. Ningún dato de identidad llega del cliente.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  // Segunda verificación contra el store: si la persona fue dada de baja
  // mientras tenía la pestaña abierta, deja de tener acceso ahora mismo.
  const profile = await getDataStore().userByEmail(email);
  if (!profile || !profile.isActive) return null;

  return {
    userId: profile.id,
    email: profile.email,
    name: profile.name,
    department: profile.department,
    role: profile.role,
  };
}

/** Igual que `getSessionContext`, pero redirige al login si no hay sesión válida. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) redirect('/login');
  return session;
}

/**
 * Datos de la petición que acompañan a una firma de excepción
 * (SEGURIDAD.md §6: IP y User-Agent en `override_metadata`).
 */
export async function getRequestContext(): Promise<RequestContext> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  return {
    ip: forwarded ? (forwarded.split(',')[0]?.trim() ?? null) : headerList.get('x-real-ip'),
    userAgent: headerList.get('user-agent'),
  };
}
