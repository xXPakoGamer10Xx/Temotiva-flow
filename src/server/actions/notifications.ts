'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getSessionContext } from '@/lib/session';
import { notificationsSeenCookie } from '@/lib/notifications-seen';

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
