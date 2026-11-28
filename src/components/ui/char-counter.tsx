import { cn } from '@/lib/utils';

/**
 * Contador discreto de un campo de texto largo (spec 006, RF-12): solo aparece
 * cuando queda un 10 % o menos y pasa a aviso en los últimos 100 caracteres.
 * Cuenta como `maxLength` y Zod (unidades UTF-16), para coincidir con el límite real.
 */
export function CharCounter({ value, max, id, className }: { value: string; max: number; id?: string; className?: string }) {
  const length = value.length;
  if (length < Math.ceil(max * 0.9)) return null;
  const nearLimit = max - length <= 100;
  return (
    <p
      id={id}
      aria-live="polite"
      className={cn(
        'w-fit text-xs tabular-nums',
        nearLimit ? 'tone-warning rounded px-1' : 'text-fg-muted',
        className,
      )}
    >
      {length.toLocaleString('es-ES')}/{max.toLocaleString('es-ES')}
    </p>
  );
}
