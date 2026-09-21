'use server';

import { AuthError } from 'next-auth';
import { isDevAuthEnabled, signIn, signOut } from '@/lib/auth';

/**
 * Acciones de sesión. El inicio de sesión real es SSO de Google; el acceso de
 * desarrollo solo existe mientras `isDevAuthEnabled` sea cierto (NODE_ENV de
 * desarrollo + ALLOW_DEV_AUTH), y aun así pasa por la misma allowlist.
 */

export async function signInWithGoogleAction(): Promise<void> {
  await signIn('google', { redirectTo: '/board' });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/login' });
}

export async function devSignInAction(email: string): Promise<{ ok: false; message: string } | void> {
  if (!isDevAuthEnabled) {
    return { ok: false, message: 'El acceso de desarrollo está desactivado.' };
  }

  try {
    await signIn('dev', { email, redirectTo: '/board' });
  } catch (error) {
    // next-auth relanza un redirect como excepción: hay que dejarlo pasar.
    if (error instanceof AuthError) {
      return { ok: false, message: 'Ese correo no está en la lista de acceso o está dado de baja.' };
    }
    throw error;
  }
}
