import Link from 'next/link';
import { Bell, KanbanSquare, Radar, ShieldCheck, TrendingUp } from 'lucide-react';
import type { SessionContext } from '@/domain/types';
import { DEPARTMENT_LABELS, USER_ROLE_LABELS } from '@/domain/labels';
import { getDataStore } from '@/server/repositories';
import { getNotifications } from '@/server/services/views';
import { Avatar, Badge } from '@/components/ui/primitives';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';
import { NavLink } from './nav-link';

/**
 * Marco de la aplicación: navegación entre las cuatro vistas, centro de
 * notificaciones e identidad de la sesión activa.
 */
export async function AppShell({
  session,
  children,
}: {
  session: SessionContext;
  children: React.ReactNode;
}) {
  const { received } = await getNotifications(getDataStore(), session);

  const links = [
    { href: '/board', label: 'Tablero', icon: KanbanSquare },
    { href: '/radar', label: 'Radar de esperas', icon: Radar },
    { href: '/executive', label: 'Dirección', icon: TrendingUp },
    ...(session.role === 'EXECUTIVE' ? [{ href: '/team', label: 'Accesos', icon: ShieldCheck }] : []),
  ] as const;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur">
        <div className="flex h-14 items-center gap-4 px-4 sm:px-6">
          <Link href="/board" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              TF
            </span>
            <span className="hidden sm:inline">Temotiva Flow</span>
          </Link>

          <nav className="scrollbar-slim -mx-1 flex flex-1 items-center gap-1 overflow-x-auto px-1">
            {links.map((link) => (
              <NavLink key={link.href} href={link.href} icon={<link.icon className="size-4" />}>
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <NavLink href="/notifications" icon={<Bell className="size-4" />} compact>
              <span className="sr-only sm:not-sr-only">Notificaciones</span>
              {received.length > 0 ? (
                <Badge tone="danger" className="ml-1 tabular-nums">
                  {received.length}
                </Badge>
              ) : null}
            </NavLink>
            <ThemeToggle />
            <UserMenu
              name={session.name}
              email={session.email}
              department={DEPARTMENT_LABELS[session.department]}
              role={USER_ROLE_LABELS[session.role]}
            />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Temotiva Flow V1 · Información confidencial y propiedad intelectual de Temotiva. No distribuir fuera del
            entorno corporativo.
          </span>
          <span className="flex items-center gap-2">
            <Avatar name={session.name} className="size-5" />
            {session.name} · {DEPARTMENT_LABELS[session.department]}
          </span>
        </div>
      </footer>
    </div>
  );
}
