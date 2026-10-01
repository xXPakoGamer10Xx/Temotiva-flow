'use client';

import * as React from 'react';

/**
 * Bus de eventos de interfaz.
 *
 * La paleta de comandos y los atajos de teclado viven en el marco de la
 * aplicación, pero tienen que poder abrir diálogos que pertenecen a otras
 * pantallas (el alta de iniciativa, el filtro del tablero). En vez de subir ese
 * estado hasta la raíz y bajarlo por props, se emite un evento en `window` y lo
 * escucha quien corresponda.
 */

export const UI_EVENTS = {
  openPalette: 'temotiva:open-palette',
  newInitiative: 'temotiva:new-initiative',
  focusFilter: 'temotiva:focus-filter',
  openShortcuts: 'temotiva:open-shortcuts',
} as const;

type UiEvent = (typeof UI_EVENTS)[keyof typeof UI_EVENTS];

function emit(name: UiEvent): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name));
}

export const openCommandPalette = (): void => emit(UI_EVENTS.openPalette);
export const openNewInitiative = (): void => emit(UI_EVENTS.newInitiative);
export const focusBoardFilter = (): void => emit(UI_EVENTS.focusFilter);
export const openShortcutsHelp = (): void => emit(UI_EVENTS.openShortcuts);

/**
 * Suscribe un manejador a un evento de interfaz mientras el componente viva.
 *
 * El manejador se guarda en la referencia dentro del efecto (nunca durante el
 * render) para que la suscripción no se rehaga en cada pintado aunque quien
 * llama pase una función nueva.
 */
export function useUiEvent(name: UiEvent, handler: () => void): void {
  const saved = React.useRef(handler);

  React.useEffect(() => {
    saved.current = handler;
  }, [handler]);

  React.useEffect(() => {
    const listener = (): void => saved.current();
    window.addEventListener(name, listener);
    return () => window.removeEventListener(name, listener);
  }, [name]);
}

/** ¿El foco está en un campo de texto? Los atajos de una tecla no deben robarlo. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
