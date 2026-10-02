'use client';

import * as React from 'react';

/**
 * Avisos breves de confirmación. Un almacén mínimo fuera de React para poder
 * lanzarlos desde cualquier acción sin montar un proveedor por pantalla.
 */

export type ToastTone = 'success' | 'danger' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const DURATION_MS = 4500;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function dismissToast(id: number): void {
  items = items.filter((item) => item.id !== id);
  emit();
}

export function toast(message: string, tone: ToastTone = 'success'): void {
  const id = nextId++;
  items = [...items.slice(-2), { id, message, tone }];
  emit();
  window.setTimeout(() => dismissToast(id), DURATION_MS);
}

const EMPTY: ToastItem[] = [];

export function useToasts(): ToastItem[] {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => items,
    () => EMPTY,
  );
}
