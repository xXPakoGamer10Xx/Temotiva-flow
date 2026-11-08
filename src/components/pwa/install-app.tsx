'use client';

import * as React from 'react';
import { Download, Share, SquarePlus } from 'lucide-react';
import { UI_EVENTS, openInstallApp, useUiEvent } from '@/components/command/command-bus';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { promptInstall, useInstallMode } from './install-store';

/**
 * Botón «Descargar app» (spec 002 RF-05a).
 *
 * `InstallAppHost` se monta una sola vez en el marco de la app y atiende el
 * evento `openInstall` (que emiten la fila de la barra lateral, el botón de la
 * barra móvil y la paleta): abre el diálogo nativo o, en iOS, los pasos
 * manuales. Nunca se muestra nada por iniciativa propia: solo el botón.
 */
export function InstallAppHost() {
  const mode = useInstallMode();
  const [iosOpen, setIosOpen] = React.useState(false);

  useUiEvent(UI_EVENTS.openInstall, () => {
    if (mode === 'native') void promptInstall();
    else if (mode === 'ios') setIosOpen(true);
  });

  return (
    <Dialog open={iosOpen} onOpenChange={setIosOpen}>
      <DialogContent className="w-[min(26rem,calc(100vw-2rem))]">
        <div className="space-y-4 px-5 py-4">
          <div className="space-y-1">
            <DialogTitle>Descargar Temotiva Flow</DialogTitle>
            <DialogDescription>En iPhone y iPad la app se añade desde Safari en dos pasos.</DialogDescription>
          </div>
          <ol className="space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <span className="tone-info inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums">1</span>
              <span>
                Pulsa <Share className="inline size-3.5 align-[-2px]" aria-hidden /> <strong>Compartir</strong> en la barra
                del navegador.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="tone-info inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums">2</span>
              <span>
                Elige <SquarePlus className="inline size-3.5 align-[-2px]" aria-hidden /> <strong>Añadir a pantalla de inicio</strong>.
              </span>
            </li>
          </ol>
          <p className="text-xs text-fg-muted">
            Ya instalada, podrás activar los avisos en este dispositivo desde Notificaciones.
          </p>
          <div className="flex justify-end">
            <Button onClick={() => setIosOpen(false)}>Entendido</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Fila del pie de la barra lateral, con el mismo aspecto que el conmutador de tema. */
export function InstallAppRow() {
  const mode = useInstallMode();
  if (mode !== 'native' && mode !== 'ios') return null;
  return (
    <button
      type="button"
      onClick={openInstallApp}
      data-sidebar-item
      className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      aria-label="Descargar la app en este dispositivo"
      title="Descargar app"
    >
      <Download className="size-4 shrink-0" />
      <span data-sidebar-label>Descargar app</span>
    </button>
  );
}

/** Icono de la barra superior en pantallas estrechas. */
export function InstallAppButton() {
  const mode = useInstallMode();
  if (mode !== 'native' && mode !== 'ios') return null;
  return (
    <button
      type="button"
      onClick={openInstallApp}
      className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2"
      aria-label="Descargar la app en este dispositivo"
      title="Descargar app"
    >
      <Download className="size-4" />
    </button>
  );
}
