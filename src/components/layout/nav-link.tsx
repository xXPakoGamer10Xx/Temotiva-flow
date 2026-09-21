'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';
import { cn } from '@/lib/utils';

/** Enlace de navegación que se marca solo cuando su ruta está activa. */
export function NavLink({
  href,
  icon,
  children,
  compact = false,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href as Route}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors',
        compact && 'px-2',
        isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
