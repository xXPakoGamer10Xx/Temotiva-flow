'use client';

import { LogOut } from 'lucide-react';
import { signOutAction } from '@/server/actions/auth';
import { Avatar } from '@/components/ui/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/controls';

/** Identidad de la sesión activa y cierre de sesión. */
export function UserMenu({
  name,
  email,
  department,
  role,
}: {
  name: string;
  email: string;
  department: string;
  role: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="ml-1 rounded-full outline-none transition-opacity hover:opacity-80"
        aria-label="Menú de la sesión"
      >
        <Avatar name={name} className="size-8 text-xs" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <span className="block text-xs font-semibold text-foreground">{name}</span>
          <span className="block font-normal text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="font-normal">
          {department} · {role}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
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
  );
}
