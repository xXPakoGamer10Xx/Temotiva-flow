'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { Menu, Search } from 'lucide-react';
import { openCommandPalette } from '@/components/command/command-bus';
import { Badge } from '@/components/ui/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/controls';
import { signOutAction } from '@/server/actions/auth';
import type { SidebarLink } from './sidebar';

/** Barra superior para pantallas estrechas, donde la navegación lateral se pliega del todo. */
export function MobileNav({ links, userName }: { links: SidebarLink[]; userName: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-surface px-3 md:hidden">
      <Link href="/board" className="flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-md bg-accent text-[10px] font-bold text-accent-fg">
          TF
        </span>
        <span className="text-[13px] font-medium tracking-tight">Temotiva Flow</span>
      </Link>

      <button
        type="button"
        onClick={openCommandPalette}
        className="ml-auto inline-flex size-8 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2"
        aria-label="Buscar"
      >
        <Search className="size-4" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2"
          aria-label="Abrir la navegación"
        >
          <Menu className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {links.map((link) => (
            <DropdownMenuItem key={link.href} asChild>
              <Link href={link.href as Route} className="flex w-full items-center gap-2">
                {link.label}
                {link.badge ? (
                  <Badge tone="danger" className="ml-auto tabular-nums">
                    {link.badge}
                  </Badge>
                ) : null}
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/cuenta" className="w-full">
              Mi cuenta
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <form action={signOutAction}>
              <button type="submit" className="w-full text-left">
                Cerrar sesión · {userName}
              </button>
            </form>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
