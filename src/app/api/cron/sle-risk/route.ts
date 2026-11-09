import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getPushSender } from '@/server/push/web-push-sender';
import { getDataStore } from '@/server/repositories';
import { notifySleRisk } from '@/server/services/push';

/**
 * Repaso de SLE en riesgo (spec 002 §8, E11).
 *
 * No usa la sesión de Google: lo llama el crontab del servidor con
 * `Authorization: Bearer <CRON_SECRET>`. Fail-closed: sin secreto configurado
 * no hace nada. La respuesta solo lleva un recuento, nunca ids ni nombres.
 *
 * Ejemplo de crontab (cada hora):
 *   0 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/sle-risk
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

function json(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** Comparación en tiempo constante; el hash iguala longitudes para no filtrarlas. */
function sameSecret(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return json({ error: 'El repaso de SLE no está configurado.' }, 503);

  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!match?.[1] || !sameSecret(match[1], secret)) {
    return NextResponse.json(
      { error: 'No autorizado.' },
      { status: 401, headers: { ...NO_STORE, 'WWW-Authenticate': 'Bearer realm="temotiva-flow-cron"' } },
    );
  }

  // Sin claves VAPID no se marcan avisos que nunca llegarían a enviarse.
  const sender = getPushSender();
  if (!sender) return json({ error: 'Las notificaciones push no están configuradas.' }, 503);

  try {
    const { notified } = await notifySleRisk(getDataStore(), sender, new Date());
    return json({ notified }, 200);
  } catch (error) {
    const kind = error instanceof Error ? error.name : 'desconocido';
    console.error(`[cron] Falló el repaso de SLE en riesgo (${kind}).`);
    return json({ error: 'No se ha podido completar el repaso.' }, 500);
  }
}
