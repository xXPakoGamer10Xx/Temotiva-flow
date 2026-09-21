import { auth } from '@/lib/auth';

/**
 * Proteccion de rutas. En Next 16 `middleware.ts` pasa a llamarse `proxy.ts` y
 * corre en runtime Node, lo que permite reutilizar la configuracion completa de
 * Auth.js (incluida la consulta a la allowlist).
 *
 * Es la primera linea de defensa, no la unica: cada Server Action revalida
 * sesion y permisos por su cuenta (SEGURIDAD.md 1.6).
 */
export const proxy = auth;
export default auth;

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
