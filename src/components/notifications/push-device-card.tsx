'use client';

import * as React from 'react';
import { BellOff, BellRing, Download, Send, Smartphone } from 'lucide-react';
import { openInstallApp } from '@/components/command/command-bus';
import { Button } from '@/components/ui/button';
import { Card, SectionLabel } from '@/components/ui/primitives';
import { toast } from '@/lib/toast';
import { sendTestPushAction, subscribePushAction, unsubscribePushAction } from '@/server/actions/push';
import { describeDevice, pushCardState, urlBase64ToUint8Array, type PushCardState } from './push-device-state';

/**
 * «Avisos en este dispositivo» (spec 002 RF-05 a RF-10).
 *
 * Recibir push lo decide cada persona en cada dispositivo (decisión D1): no
 * depende de las preferencias del equipo. El permiso del navegador solo se
 * pide al pulsar «Activar», nunca al cargar (RF-07).
 *
 * Al cargar, si este navegador ya tenía una suscripción, se vuelve a enviar al
 * servidor en silencio: así, si en el dispositivo ha entrado otra cuenta, los
 * avisos pasan a ser de la cuenta actual.
 */
export function PushDeviceCard({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = React.useState<PushCardState | 'loading'>('loading');
  const [device, setDevice] = React.useState('este navegador');
  const [busy, setBusy] = React.useState(false);

  const evaluate = React.useCallback(async (): Promise<void> => {
    const result = await readDevice(vapidPublicKey);
    setDevice(result.device);
    setState(result.state);
  }, [vapidPublicKey]);

  React.useEffect(() => {
    let cancelled = false;
    void readDevice(vapidPublicKey).then((result) => {
      if (cancelled) return;
      // Ya suscrito: se reafirma en el servidor por si el dispositivo cambió de cuenta.
      if (result.subscription) void subscribePushAction(result.subscription.toJSON());
      setDevice(result.device);
      setState(result.state);
    });
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  async function activate(): Promise<void> {
    if (!vapidPublicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast(permission === 'denied' ? 'El navegador ha bloqueado los avisos.' : 'No se activaron los avisos.', 'info');
        return;
      }
      const registration = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }));
      await navigator.serviceWorker.ready;
      const subscription = await subscribeWithKey(registration, vapidPublicKey);
      const result = await subscribePushAction(subscription.toJSON());
      if (!result.ok) {
        await subscription.unsubscribe();
        toast(result.message, 'danger');
        return;
      }
      toast('Avisos activados en este dispositivo');
    } catch {
      toast('No se pudieron activar los avisos en este dispositivo. Inténtalo de nuevo.', 'danger');
    } finally {
      setBusy(false);
      await evaluate();
    }
  }

  async function deactivate(): Promise<void> {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (subscription) {
        const { endpoint } = subscription;
        await subscription.unsubscribe();
        await unsubscribePushAction({ endpoint });
      }
      toast('Avisos desactivados en este dispositivo');
    } catch {
      toast('No se pudieron desactivar los avisos. Inténtalo de nuevo.', 'danger');
    } finally {
      setBusy(false);
      await evaluate();
    }
  }

  async function sendTest(): Promise<void> {
    setBusy(true);
    try {
      const result = await sendTestPushAction();
      if (result.ok) {
        toast(result.data.sent === 1 ? 'Aviso de prueba enviado' : `Aviso de prueba enviado a ${result.data.sent} dispositivos`);
      } else {
        toast(result.message, 'danger');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2">
      <SectionLabel>Avisos en este dispositivo</SectionLabel>
      <Card className="space-y-3 p-4">
        <Body state={state} device={device} busy={busy} onActivate={activate} onDeactivate={deactivate} onTest={sendTest} />
        {state !== 'loading' && state !== 'unsupported' && state !== 'unavailable' ? (
          <p className="text-xs text-fg-muted">
            Estos avisos dependen solo de ti y de este dispositivo. Nunca muestran títulos ni descripciones: solo el tipo de
            aviso, el área y el código TEMO.
          </p>
        ) : null}
      </Card>
    </section>
  );
}

/** Lee el entorno del navegador. `subscription` solo si está activa y hay clave en el servidor. */
async function readDevice(
  vapidPublicKey: string | null,
): Promise<{ state: PushCardState; device: string; subscription: PushSubscription | null }> {
  const nav = navigator as Navigator & { standalone?: boolean };
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isIos = /iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
  const registration = supported ? await navigator.serviceWorker.getRegistration() : undefined;
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  const permission: NotificationPermission = supported ? Notification.permission : 'default';
  const state = pushCardState({
    supported,
    isIos,
    standalone,
    hasKey: Boolean(vapidPublicKey),
    permission,
    subscribed: Boolean(subscription),
  });
  return { state, device: describeDevice(nav.userAgent), subscription: state === 'active' ? subscription : null };
}

/** Si el servidor cambió de clave, la suscripción vieja impide crear otra: se rehace. */
async function subscribeWithKey(registration: ServiceWorkerRegistration, key: string): Promise<PushSubscription> {
  const options = { userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) };
  try {
    return await registration.pushManager.subscribe(options);
  } catch (error) {
    const existing = await registration.pushManager.getSubscription();
    if (!existing) throw error;
    await existing.unsubscribe();
    return registration.pushManager.subscribe(options);
  }
}

function Body({
  state,
  device,
  busy,
  onActivate,
  onDeactivate,
  onTest,
}: {
  state: PushCardState | 'loading';
  device: string;
  busy: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onTest: () => void;
}) {
  switch (state) {
    case 'loading':
      return <p className="text-sm text-fg-muted">Comprobando este dispositivo…</p>;

    case 'unsupported':
      return (
        <Row icon={<BellOff className="size-3.5" />} title="Este navegador no admite avisos">
          Prueba con Chrome, Edge, Firefox o Safari actualizados, o instala la app en el móvil.
        </Row>
      );

    case 'ios-install':
      return (
        <div className="space-y-3">
          <Row icon={<Smartphone className="size-3.5" />} title="Primero, añade la app a la pantalla de inicio">
            En iPhone y iPad los avisos solo funcionan con la app instalada (iOS 16.4 o posterior). Instálala y ábrela desde
            su icono para activarlos.
          </Row>
          <Button variant="outline" size="sm" onClick={openInstallApp}>
            <Download className="size-3.5" />
            Cómo instalarla
          </Button>
        </div>
      );

    case 'unavailable':
      return (
        <Row icon={<BellOff className="size-3.5" />} title="No disponible en este entorno">
          Los avisos al dispositivo todavía no están configurados en este servidor.
        </Row>
      );

    case 'blocked':
      return (
        <Row icon={<BellOff className="size-3.5" />} title="El navegador tiene los avisos bloqueados para Temotiva Flow">
          Ábrelos desde el candado de la barra de direcciones → Configuración del sitio → Notificaciones → Permitir, y vuelve a
          cargar la página.
        </Row>
      );

    case 'inactive':
      return (
        <div className="space-y-3">
          <Row icon={<BellRing className="size-3.5" />} title={`Avisos desactivados en ${device}`}>
            Te avisaremos de lo que te toca: tareas y peticiones para tu área, iniciativas que entran en tu tablero, paradas y
            SLE a punto de vencer. El navegador te pedirá permiso.
          </Row>
          <Button size="sm" onClick={onActivate} disabled={busy}>
            <BellRing className="size-3.5" />
            Activar en este dispositivo
          </Button>
        </div>
      );

    case 'active':
      return (
        <div className="space-y-3">
          <Row icon={<span className="tone-success inline-block size-2 rounded-full" />} title={`Avisos activados en ${device}`}>
            Los recibirás aunque la app esté cerrada.
          </Row>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onTest} disabled={busy}>
              <Send className="size-3.5" />
              Enviar aviso de prueba
            </Button>
            <Button size="sm" variant="ghost" onClick={onDeactivate} disabled={busy}>
              <BellOff className="size-3.5" />
              Desactivar en este dispositivo
            </Button>
          </div>
        </div>
      );
  }
}

function Row({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-1 inline-flex shrink-0 text-fg-muted" aria-hidden>
        {icon}
      </span>
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-fg-muted">{children}</span>
      </span>
    </div>
  );
}
