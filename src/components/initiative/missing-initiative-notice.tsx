'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { toast } from '@/lib/toast';

/**
 * Se monta cuando `?iniciativa=` apunta a un ID que no existe: avisa y limpia
 * el parámetro, en vez de dejar la pantalla como si no hubiera pasado nada.
 */
export function MissingInitiativeNotice({ initiativeId }: { initiativeId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  React.useEffect(() => {
    toast(`No existe la iniciativa ${initiativeId}. Puede haberse escrito mal el enlace.`, 'danger');
    const next = new URLSearchParams(searchParams.toString());
    next.delete('iniciativa');
    const queryString = next.toString();
    router.replace((queryString ? `${pathname}?${queryString}` : pathname) as Route, { scroll: false });
    // Solo al montar: el parámetro se retira justo después.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
