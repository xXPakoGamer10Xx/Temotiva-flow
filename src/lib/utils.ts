import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Composición de clases de Tailwind sin conflictos (convención shadcn/ui). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
});

const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeZone: 'Europe/Madrid' });

/** 21/09/26, 18:42 — hora peninsular, que es donde opera el equipo. */
export function formatDateTime(iso: string): string {
  return DATE_TIME_FORMAT.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

/** "hace 3 h", "hace 2 d" — para listados densos. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'ahora mismo';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} d`;
}

/** Iniciales para los avatares (máximo dos). */
export function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function formatPercent(value: number, decimals = 0): string {
  return `${(value * 100).toFixed(decimals)} %`;
}
