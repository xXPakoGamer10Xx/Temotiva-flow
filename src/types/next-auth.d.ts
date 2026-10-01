import type { Department, UserRole } from '@/domain/enums';

/**
 * Extension del tipo de sesion de Auth.js con el perfil corporativo hidratado
 * desde la tabla `users` (DESIGN.md 8.1).
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      departments: Department[];
      role: UserRole;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    departments?: Department[];
    role?: UserRole;
  }
}

export {};
