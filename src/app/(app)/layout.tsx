import { AppShell } from '@/components/layout/app-shell';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Marco compartido de todas las vistas autenticadas. Vive en un layout para
 * que la barra lateral, la paleta de comandos y la guía NO se desmonten al
 * cambiar de vista: solo se sustituye el contenido (y su `loading.tsx`).
 * Cada página sigue validando la sesión por su cuenta.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return <AppShell session={session}>{children}</AppShell>;
}
