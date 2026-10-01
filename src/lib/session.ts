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
    departments: profile.departments,
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
  const hops = (forwarded ?? '')
    .split(',')
    .map((hop) => hop.trim())
    .filter(Boolean);

  return {
    // `x-forwarded-for` se rellena de izquierda a derecha y el cliente controla
    // el primer valor: tomarlo permitiría firmar una excepción desde una IP
    // inventada. Se usa el salto más cercano al servidor (el que añade nuestro
    // proxy) y, si existe, `x-real-ip`, que el proxy fija por su cuenta.
    ip: headerList.get('x-real-ip') ?? hops.at(-1) ?? null,
    // La cadena completa se guarda para el análisis forense: deja ver si el
    // cliente intentó inyectar saltos por delante.
    ipChain: hops.length > 1 ? hops.join(' → ') : null,
    userAgent: headerList.get('user-agent'),
  };
}
