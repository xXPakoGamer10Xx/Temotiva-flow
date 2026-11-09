import 'server-only';
import { after } from 'next/server';
import { onAuditAppended } from '@/server/services/audit-listeners';
import { deliver, type PushSender } from '@/server/services/push';
import { resolvePushTargets } from '@/server/services/push-targets';
import { getPushSender } from './web-push-sender';

/**
 * Engancha las notificaciones push a la caja negra (spec 002 §9).
 *
 * Lo llama `src/instrumentation.ts` una vez al arrancar el servidor. Cada
 * entrada de `audit()` se traduce en avisos **después** de responder: dentro
 * de una petición con `after()`; fuera de ella (scripts, tareas) en segundo
 * plano. Nada de esto puede romper la acción que originó el evento.
 *
 * Idempotente: el estado vive en `globalThis` para sobrevivir a recargas del
 * módulo en desarrollo sin registrar el oyente dos veces.
 */
const STATE_KEY = Symbol.for('temotiva-flow.push-listener');

type ListenerState = { off: () => void };

function state(): { current?: ListenerState } {
  const scope = globalThis as typeof globalThis & { [STATE_KEY]?: { current?: ListenerState } };
  scope[STATE_KEY] ??= {};
  return scope[STATE_KEY];
}

/** `true` si el despachador queda activo; `false` sin claves VAPID. */
export function registerPushListener(sender: PushSender | null = getPushSender()): boolean {
  if (!sender) return false;
  const holder = state();
  if (holder.current) return true;

  const off = onAuditAppended((store, entry) => {
    const job = async (): Promise<void> => {
      try {
        const targets = await resolvePushTargets(store, entry);
        if (targets) await deliver(store, sender, targets.userIds, targets.message, new Date());
      } catch (error) {
        const kind = error instanceof Error ? error.name : 'desconocido';
        console.error(`[push] No se pudo despachar un aviso (${kind}).`);
      }
    };
    try {
      after(job);
    } catch {
      // Fuera de una petición de Next no hay `after()`: se lanza sin esperar.
      void job();
    }
  });

  holder.current = { off };
  return true;
}

/** Solo para tests: deja el proceso sin oyente. */
export function unregisterPushListenerForTests(): void {
  const holder = state();
  holder.current?.off();
  holder.current = undefined;
}
