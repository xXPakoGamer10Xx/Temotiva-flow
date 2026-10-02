'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';
import {
  Bell,
  KanbanSquare,
  LogOut,
  Moon,
  PanelLeft,
  Radar,
  Search,
  ShieldCheck,
  Sun,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { signOutAction } from '@/server/actions/auth';
import { openCommandPalette } from '@/components/command/command-bus';
import { Avatar, Badge, Kbd } from '@/components/ui/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/controls';
import { BrandMark } from '@/components/shared/brand-mark';
import { cn } from '@/lib/utils';

export interface SidebarLink {
  href: string;
  label: string;
  icon: 'board' | 'radar' | 'executive' | 'notifications' | 'team';
  badge?: number;
  shortcut?: string;
}

const ICONS = {
  board: KanbanSquare,
  radar: Radar,
  executive: TrendingUp,
  notifications: Bell,
  team: ShieldCheck,
} as const;

/**
 * Navegación lateral. Se pliega a una columna de iconos y el estado se guarda
 * como clase en <html> (ver `globals.css`), no como estado de React: así el
 * servidor y el cliente nunca discrepan al hidratar.
 */
export function Sidebar({
  links,
  user,
}: {
  links: SidebarLink[];
  user: { name: string; email: string; department: string; role: string };
}) {
  const pathname = usePathname();

  const toggleSidebar = (): void => {
    const collapsed = document.documentElement.classList.toggle('sidebar-collapsed');
    try {
      localStorage.setItem('temotiva-sidebar', collapsed ? 'collapsed' : 'expanded');
    } catch {
      // Almacenamiento bloqueado: el plegado dura lo que dure la pestaña.
    }
  };

  return (
    <aside
      data-sidebar
      className="sticky top-0 z-30 hidden h-dvh w-[13.5rem] shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 md:flex"
    >
      <div className="flex h-12 items-center gap-2 px-2.5">
        <Link
          href="/board"
          data-sidebar-item
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-2"
        >
          <BrandMark className="size-7" />
          <span data-sidebar-label className="truncate text-sm font-medium tracking-tight">
            Temotiva Flow
          </span>
        </Link>
        <button
          type="button"
          onClick={toggleSidebar}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label="Plegar o desplegar la navegación"
          title="Plegar o desplegar la navegación"
        >
          <PanelLeft className="size-4" />
        </button>
      </div>

      <div className="px-2 pb-2">
        <button
          type="button"
          onClick={openCommandPalette}
          data-sidebar-item
          className="flex h-7 w-full items-center gap-2 rounded-md border border-border bg-surface-2/60 px-2 text-xs text-fg-subtle transition-colors hover:border-border-strong hover:text-fg-muted"
          title="Buscar y ejecutar acciones (Ctrl+K)"
        >
          <Search className="size-3.5 shrink-0" />
          <span data-sidebar-label className="flex-1 text-left">
            Buscar…
          </span>
          <Kbd data-sidebar-label>⌘K</Kbd>
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 px-2">
        {links.map((link) => {
          const Icon = ICONS[link.icon];
          const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);

          return (
            <Link
              key={link.href}
              href={link.href as Route}
              data-sidebar-item
              aria-current={isActive ? 'page' : undefined}
              title={link.label}
              className={cn(
                'group/nav flex h-7 items-center gap-2 rounded-md px-2 text-sm transition-colors',
                isActive
                  ? 'bg-surface-2 font-medium text-fg'
                  : 'text-fg-muted hover:bg-surface-2/70 hover:text-fg',
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span data-sidebar-label className="flex-1 truncate">
                {link.label}
              </span>
              {link.badge ? (
                <Badge tone="danger" className="tabular-nums">
                  {link.badge}
                </Badge>
              ) : link.shortcut ? (
                <Kbd data-sidebar-label className="opacity-0 transition-opacity group-hover/nav:opacity-100">
                  {link.shortcut}
                </Kbd>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-border p-2">
        <ThemeToggleRow />
        <DropdownMenu>
          <DropdownMenuTrigger
            data-sidebar-item
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
            aria-label="Menú de la sesión"
          >
            <Avatar name={user.name} className="size-6" />
            <span data-sidebar-label className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-fg">{user.name}</span>
              <span className="block truncate text-xs text-fg-subtle">{user.department}</span>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            <DropdownMenuLabel>
              <span className="block text-xs font-medium text-fg">{user.name}</span>
              <span className="block font-normal text-fg-subtle">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="font-normal">
              {user.department} · {user.role}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/cuenta" className="flex w-full items-center gap-2">
                <UserRound className="size-3.5" />
                Mi cuenta
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <form action={signOutAction}>
                <button type="submit" className="flex w-full items-center gap-2 text-left">
                  <LogOut className="size-3.5" />
                  Cerrar sesión
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}

/** Conmutador de tema: lee la clase de <html> como estado externo. */
function ThemeToggleRow() {
  const isDark = React.useSyncExternalStore(
    subscribeToTheme,
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );

  const toggle = (): void => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('temotiva-theme', next ? 'dark' : 'light');
    } catch {
      // Navegación privada o almacenamiento bloqueado: el tema dura la sesión.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      data-sidebar-item
      className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={isDark ? 'Tema claro' : 'Tema oscuro'}
    >
      {isDark ? <Sun className="size-4 shrink-0" /> : <Moon className="size-4 shrink-0" />}
      <span data-sidebar-label>{isDark ? 'Tema claro' : 'Tema oscuro'}</span>
    </button>
  );
}

function subscribeToTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}
