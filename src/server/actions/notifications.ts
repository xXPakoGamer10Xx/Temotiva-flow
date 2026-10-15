'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getSessionContext } from '@/lib/session';
import { notificationsSeenCookie } from '@/lib/notifications-seen';
import { DEPARTMENTS } from '@/domain/enums';
import { setOwnNotifications, setTeamNotifications } from '@/server/services/notification-settings';
import { type ActionResult, runAction } from './shared';

/**
 * Marca las notificaciones como vistas: guarda el instante en una cookie propia
 * de la persona. La bandeja sigue mostrando todo lo pendiente; solo el
 * contador del menú pasa a contar lo que llegó después.
 */
export async function markNotificationsSeenAction(): Promise<void> {
  const session = await getSessionContext();
  if (!session) return;
  (await cookies()).set(notificationsSeenCookie(session.userId), new Date().toISOString(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath('/', 'layout');
}

/** El responsable decide si recibe sus propias notificaciones. */
export async function setOwnNotificationsAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: z.object({ enabled: z.boolean() }),
    input,
    handler: async ({ store, session, input: data }) => {
      await setOwnNotifications(store, session, data);
      return undefined;
    },
  });
}

/** El responsable decide si el equipo de su área recibe las notificaciones de esa área. */
export async function setTeamNotificationsAction(input: unknown): Promise<ActionResult<undefined>> {
  return runAction({
    schema: z.object({ department: z.enum(DEPARTMENTS), enabled: z.boolean() }),
    input,
    handler: async ({ store, session, input: data }) => {
      await setTeamNotifications(store, session, data);
      return undefined;
    },
  });
}
