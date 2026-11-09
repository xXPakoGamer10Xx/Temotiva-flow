import { randomUUID } from 'node:crypto';
import { PUSH_TEST_KIND, type PushMessage, type PushSubscriptionRecord } from '@/domain/push';
import { AT_RISK_RATIO } from '@/domain/rules';
import type { SessionContext, User } from '@/domain/types';
import type { DataStore } from '@/server/repositories/types';
import { buildPushMessage } from './push-messages';
import { computeSle } from './sle';

/**
 * Entrega de notificaciones push (spec 002 §5 y §8).
 *
 * El envío real va detrás de `PushSender` (implementación con `web-push` en
 * `src/server/push/`), así que todo esto se prueba sin red. Ninguna función de
 * entrega lanza por un fallo del servicio push: un aviso perdido nunca rompe la
 * acción que lo originó (RF-16, CA-10).
 *
 * Privacidad: `endpoint`, `p256dh` y `auth` identifican un dispositivo y nunca
 * se escriben en logs.
 */

/** `gone` = el servicio push respondió 404/410: la suscripción ya no existe. */
export type PushDeliveryResult = 'ok' | 'gone' | 'error';

export interface PushSender {
  send(sub: PushSubscriptionRecord, payload: string): Promise<PushDeliveryResult>;
}

export interface DeliveryReport {
  sent: number;
  revoked: number;
  failed: number;
}

const MAX_USER_AGENT = 200;

export async function deliver(
  store: DataStore,
  sender: PushSender,
  userIds: string[],
  message: PushMessage,
  now: Date,
): Promise<DeliveryReport> {
  const report: DeliveryReport = { sent: 0, revoked: 0, failed: 0 };
  if (userIds.length === 0) return report;

  const subs = await store.listActivePushSubscriptions(userIds);
  const payload = JSON.stringify(message);
  const at = now.toISOString();

  const results = await Promise.all(
    subs.map(async (sub): Promise<PushDeliveryResult> => {
      try {
        return await sender.send(sub, payload);
      } catch (error) {
        logPushError('envío', error);
        return 'error';
      }
    }),
  );

  for (const [index, result] of results.entries()) {
    const sub = subs[index];
    if (!sub) continue;
    if (result === 'ok') {
      report.sent += 1;
      await store.touchPushSubscription(sub.endpoint, at);
    } else if (result === 'gone') {
      report.revoked += 1;
      await store.revokePushSubscription(sub.endpoint, at);
    } else {
      report.failed += 1;
    }
  }
  return report;
}

export interface SubscribeDeviceInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  now?: Date;
}

/** Activa los avisos en un dispositivo para la persona de la sesión (RF-08). */
export async function subscribeDevice(
  store: DataStore,
  session: SessionContext,
  input: SubscribeDeviceInput,
): Promise<PushSubscriptionRecord> {
  const now = input.now ?? new Date();
  return store.upsertPushSubscription({
    id: randomUUID(),
    userId: session.userId,
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
    userAgent: input.userAgent ? input.userAgent.slice(0, MAX_USER_AGENT) : null,
    createdAt: now.toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  });
}

/**
 * Desactiva los avisos en un dispositivo (RF-09). Solo actúa sobre un
 * dispositivo de la propia sesión; con uno ajeno o desconocido no hace nada y
 * no lo dice, para no revelar si existe.
 */
export async function unsubscribeDevice(
  store: DataStore,
  session: SessionContext,
  input: { endpoint: string; now?: Date },
): Promise<void> {
  const sub = await store.pushSubscriptionByEndpoint(input.endpoint);
  if (!sub || sub.userId !== session.userId) return;
  await store.revokePushSubscription(sub.endpoint, (input.now ?? new Date()).toISOString());
}

/** Aviso de prueba solo a los dispositivos de quien lo pide (RF-10). */
export function sendTestPush(store: DataStore, sender: PushSender, session: SessionContext, now: Date): Promise<DeliveryReport> {
  const message: PushMessage = {
    kind: PUSH_TEST_KIND,
    title: 'Avisos activados',
    body: 'Así llegarán los avisos de Temotiva Flow a este dispositivo.',
    url: '/notifications',
    tag: `${PUSH_TEST_KIND}:${session.userId}`,
  };
  return deliver(store, sender, [session.userId], message, now);
}

/**
 * E11 — SLE en riesgo (spec 002 §8). Lo llama el crontab vía
 * `/api/cron/sle-risk`. Una sola vez por iniciativa y fase: la marca se pone
 * **antes** de enviar, así que dos ejecuciones solapadas no duplican el aviso y
 * un envío fallido no se reintenta en bucle.
 */
export async function notifySleRisk(store: DataStore, sender: PushSender, now: Date): Promise<{ notified: number }> {
  const [initiatives, stages, users] = await Promise.all([
    store.listInitiatives(),
    store.listStages(),
    store.listUsers(),
  ]);
  const stagesById = new Map(stages.map((stage) => [stage.id, stage]));
  const reachable = users.filter(isReachable);
  let notified = 0;

  for (const initiative of initiatives) {
    if (initiative.isArchived) continue;
    const stage = stagesById.get(initiative.currentStageId);
    if (!stage) continue;

    const reading = computeSle(initiative, stage, now);
    if (reading.ratio < AT_RISK_RATIO) continue;

    const isNew = await store.insertSleRiskNotice({
      initiativeId: initiative.id,
      stageId: stage.id,
      notifiedAt: now.toISOString(),
    });
    if (!isNew) continue;
    notified += 1;

    const assignee = reachable.find((user) => user.id === initiative.currentAssigneeId);
    const recipients = assignee
      ? [assignee.id]
      : reachable
          .filter((user) => user.role === 'LEAD' && user.departments.includes(initiative.ownerDepartment))
          .map((user) => user.id);

    const message = buildPushMessage('SLE_AT_RISK', {
      initiativeId: initiative.id,
      stageKey: stage.key,
      percent: reading.ratio * 100,
    });
    await deliver(store, sender, recipients, message, now);
  }

  return { notified };
}

function isReachable(user: User): boolean {
  return user.isActive && !user.isAnonymized;
}

function logPushError(stage: string, error: unknown): void {
  // Solo el tipo de error: el mensaje de la librería puede incluir el endpoint.
  const kind = error instanceof Error ? error.name : 'desconocido';
  console.error(`[push] Fallo en ${stage} de un aviso (${kind}).`);
}
