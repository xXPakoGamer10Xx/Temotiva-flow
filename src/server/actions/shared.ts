import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { SessionContext } from '@/domain/types';
import { getSessionContext } from '@/lib/session';
import { getDataStore } from '@/server/repositories';
import type { DataStore } from '@/server/repositories/types';
import { DomainError } from '@/server/services/errors';
import type { ActionResult } from '@/lib/action-result';

/**
 * Andamiaje común de las Server Actions.
 *
 * Cada acción: 1) resuelve la sesión con `auth()`, 2) valida la entrada con
 * zod, 3) delega en un servicio de dominio, 4) revalida las vistas afectadas.
 * Los permisos se comprueban dentro del servicio, con la sesión validada.
 */

export type { ActionResult } from '@/lib/action-result';

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = (message: string, code?: string): ActionResult<never> => ({ ok: false, message, code });

/** Revalida las cuatro vistas y la barra de notificaciones de una vez. */
export function revalidateViews(): void {
  revalidatePath('/', 'layout');
}

interface RunOptions<Input, Output> {
  schema: z.ZodType<Input>;
  input: unknown;
  handler: (context: { store: DataStore; session: SessionContext; input: Input }) => Promise<Output>;
  /** Por defecto revalida; se desactiva en acciones de solo lectura. */
  revalidate?: boolean;
}

export async function runAction<Input, Output>({
  schema,
  input,
  handler,
  revalidate = true,
}: RunOptions<Input, Output>): Promise<ActionResult<Output>> {
  const session = await getSessionContext();
  if (!session) return fail('Tu sesión ha caducado o tu acceso fue revocado. Vuelve a entrar.', 'UNAUTHENTICATED');

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail(first?.message ?? 'Los datos enviados no son válidos.', 'VALIDATION');
  }

  try {
    const data = await handler({ store: getDataStore(), session, input: parsed.data });
    if (revalidate) revalidateViews();
    return ok(data);
  } catch (error) {
    if (error instanceof DomainError) return fail(error.message, error.code);
    // Nunca se filtra la traza interna a la interfaz (SEGURIDAD.md §8.5).
    console.error('[temotiva-flow] error inesperado en una acción:', error);
    return fail('No se ha podido completar la operación. Inténtalo de nuevo.');
  }
}

export const initiativeIdSchema = z
  .string()
  .regex(/^TEMO-\d+$/, 'Identificador de iniciativa no válido.');
