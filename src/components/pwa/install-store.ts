import * as React from 'react';

/**
 * Estado del botón «Descargar app» (spec 002 RF-05a).
 *
 *  - `native`: el navegador ofrece su diálogo de instalación (Chrome, Edge, Android).
 *  - `ios`: iPhone/iPad, donde solo se instala con «Compartir → Añadir a pantalla de inicio».
 *  - `installed`: ya se está usando la app instalada; no se muestra nada.
 *  - `unsupported`: no hay vía de instalación (o aún no ha llegado el evento).
 *
 * Es un almacén externo para `useSyncExternalStore`: el evento
 * `beforeinstallprompt` puede llegar antes de que React monte, así que los
 * oyentes se instalan al cargar el módulo y el estado vive fuera de React.
 */
export type InstallMode = 'native' | 'ios' | 'installed' | 'unsupported';

export interface InstallEnvironment {
  userAgent: string;
  /** `display-mode: standalone` o `navigator.standalone` (iOS). */
  standalone: boolean;
  /** Hay un `beforeinstallprompt` guardado. */
  hasPrompt: boolean;
  maxTouchPoints: number;
}

export function detectInstallMode(env: InstallEnvironment): InstallMode {
  if (env.standalone) return 'installed';
  if (env.hasPrompt) return 'native';
  const isIos = /iPhone|iPad|iPod/.test(env.userAgent) || (/Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1);
  return isIos ? 'ios' : 'unsupported';
}

/** Evento no estándar de Chromium; no está en los tipos del DOM. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedNow = false;
let snapshot: InstallMode = 'unsupported';
const listeners = new Set<() => void>();

function compute(): InstallMode {
  if (typeof window === 'undefined') return 'unsupported';
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return detectInstallMode({
    userAgent: nav.userAgent,
    standalone: installedNow || window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true,
    hasPrompt: deferredPrompt !== null,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
  });
}

function refresh(): void {
  const next = compute();
  if (next === snapshot) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

let initialized = false;

/** Instala los oyentes una sola vez. Se llama al cargar el módulo en el navegador. */
export function initInstallStore(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    // Sin `preventDefault` Chrome mostraría su propio aviso: aquí solo hay botón.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    refresh();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installedNow = true;
    refresh();
  });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', refresh);
  snapshot = compute();
}

initInstallStore();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useInstallMode(): InstallMode {
  return React.useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => 'unsupported',
  );
}

/** Abre el diálogo nativo. `true` si la persona aceptó instalar. */
export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt;
  if (!event) return false;
  // El evento solo se puede usar una vez.
  deferredPrompt = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  refresh();
  return outcome === 'accepted';
}
