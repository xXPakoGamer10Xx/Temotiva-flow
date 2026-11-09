'use client';

import * as React from 'react';
import { signOutAction } from '@/server/actions/auth';
import { unsubscribePushAction } from '@/server/actions/push';

/** Tiempo máximo que se espera a dar de baja el dispositivo: cerrar sesión nunca debe quedarse colgado. */
const UNSUBSCRIBE_TIMEOUT_MS = 3000;

/**
 * Da de baja los avisos de ESTE dispositivo. En un equipo compartido, la
 * siguiente persona no debe recibir los avisos de quien se fue. Cualquier fallo
 * se ignora: el cierre de sesión continúa y, aun así, el servidor deja de
 * enviar en cuanto se revoca el perfil o el servicio push responde 404/410.
 */
async function unsubscribeThisDevice(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    if (!subscription) return;
    const { endpoint } = subscription;
    await subscription.unsubscribe();
    await unsubscribePushAction({ endpoint });
  } catch {
    // Sin red, sin permiso o sin sesión: se sigue con el cierre.
  }
}

async function withTimeout(task: Promise<void>, ms: number): Promise<void> {
  await Promise.race([task, new Promise<void>((resolve) => setTimeout(resolve, ms))]);
}

/** Formulario de «Cerrar sesión»: baja el dispositivo del push y después cierra la sesión. */
export function SignOutForm({ children }: { children: React.ReactNode }) {
  return (
    <form
      action={async () => {
        await withTimeout(unsubscribeThisDevice(), UNSUBSCRIBE_TIMEOUT_MS);
        await signOutAction();
      }}
    >
      {children}
    </form>
  );
}
