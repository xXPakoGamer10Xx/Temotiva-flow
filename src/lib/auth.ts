import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { createHash } from 'node:crypto';
import type { Department, UserRole } from '@/domain/enums';
import { getDataStore } from '@/server/repositories';
import { normalizeEmail } from '@/server/services/access';

/**
 * Autenticación corporativa (SEGURIDAD.md §3).
 *
 * El equipo lo forman personas colaboradoras externas con cuentas de Google
 * propias, así que el dominio del correo no autoriza nada. La autorización es
 * una allowlist estricta y fail-closed: el correo autenticado debe existir en
 * la tabla `users` y estar activo. De ahí salen `userId`, `department` y `role`
 * que viajan en el token y sostienen todo el RBAC del servidor.
 *
 * El proveedor de credenciales de desarrollo solo existe si
 * NODE_ENV === 'development' Y ALLOW_DEV_AUTH === 'true'. En producción no se
 * registra jamás, ni aunque la variable esté presente.
 */

export const isDevAuthEnabled =
  process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH === 'true';

export const isGoogleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

/**
 * En producción el secreto solo puede venir del entorno: si falta, Auth.js
 * rechaza cada petición (fail-closed) en lugar de firmar con algo improvisado.
 *
 * En desarrollo, para no obligar a configurar nada antes de ver la aplicación,
 * se deriva un valor local del directorio del proyecto. Tiene que ser
 * determinista: `proxy.ts` y las rutas del servidor se compilan por separado y
 * un valor aleatorio daría una clave distinta en cada uno, con lo que ninguna
 * sesión sobreviviría al salto entre ambos.
 */
function resolveSecret(): string | undefined {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === 'production') return undefined;
  console.warn(
    '[temotiva-flow] AUTH_SECRET no definido: usando una clave local de desarrollo. ' +
      'Genera la real con `npx auth secret` antes de exponer la aplicación.',
  );
  return createHash('sha256').update(`temotiva-flow:dev:${process.cwd()}`).digest('hex');
}

const providers: NextAuthConfig['providers'] = [];

if (isGoogleConfigured) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: { params: { prompt: 'select_account' } },
    }),
  );
}

if (isDevAuthEnabled) {
  providers.push(
    Credentials({
      id: 'dev',
      name: 'Acceso de desarrollo',
      credentials: { email: { label: 'Correo', type: 'email' } },
      async authorize(credentials) {
        if (!isDevAuthEnabled) return null;
        const email = typeof credentials?.email === 'string' ? normalizeEmail(credentials.email) : '';
        if (!email) return null;
        const user = await getDataStore().userByEmail(email);
        if (!user || !user.isActive) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  );
}

export const authConfig = {
  providers,
  secret: resolveSecret(),
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    /** Puerta de entrada: solo pasa quien está en la allowlist y activo. */
    async signIn({ user }) {
      const email = user.email ? normalizeEmail(user.email) : null;
      if (!email) return false;
      const profile = await getDataStore().userByEmail(email);
      return Boolean(profile?.isActive);
    },

    /**
     * El token se rehidrata desde `users` en cada petición: una baja o un
     * cambio de rol surte efecto de inmediato, sin esperar a que expire la
     * sesión. Devolver null invalida la sesión (fail-closed).
     */
    async jwt({ token }) {
      const email = typeof token.email === 'string' ? normalizeEmail(token.email) : null;
      if (!email) return null;
      const profile = await getDataStore().userByEmail(email);
      if (!profile || !profile.isActive) return null;

      token.sub = profile.id;
      token.name = profile.name;
      token.email = profile.email;
      token.department = profile.department;
      token.role = profile.role;
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.sub === 'string' ? token.sub : '';
        session.user.department = token.department as Department;
        session.user.role = token.role as UserRole;
      }
      return session;
    },

    /** Protección de rutas usada por `proxy.ts`. */
    authorized({ auth: session, request }) {
      const { pathname } = request.nextUrl;
      if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) return true;
      return Boolean(session?.user);
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
