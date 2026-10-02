'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { ActionResult } from './action-result';
import { toast } from './toast';

/**
 * Ejecuta una Server Action desde un formulario: gestiona el estado de envío,
 * el mensaje de error que devuelve el servidor y el refresco de la vista.
 *
 * La validación real vive en el servidor; aquí solo se muestra su respuesta.
 */
export function useAction<Input, Output>(
  action: (input: Input) => Promise<ActionResult<Output>>,
  options: { success?: string } = {},
) {
  const successMessage = options.success;
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(
    (input: Input, onSuccess?: (data: Output) => void): void => {
      setError(null);
      startTransition(async () => {
        const result = await action(input);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        if (successMessage) toast(successMessage);
        onSuccess?.(result.data);
        router.refresh();
      });
    },
    [action, router, successMessage],
  );

  return { run, isPending, error, setError } as const;
}

/** Mensaje de error de acción, con el mismo aspecto en todos los formularios. */
export function ActionError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="tone-danger rounded-md px-2.5 py-1.5 text-xs">
      {message}
    </p>
  );
}
