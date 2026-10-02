import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Primitivas de presentación del sistema visual: superficies, etiquetas,
 * campos y microcomponentes. Bordes de 1 px, esquinas cortas, densidad alta y
 * color solo donde hay señal.
 */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-surface shadow-[var(--shadow-card)]', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 px-4 pt-4 pb-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-sm font-medium tracking-tight text-fg', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs leading-relaxed text-fg-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 pb-4', className)} {...props} />;
}

/** Etiqueta translúcida: la receta de color vive en `globals.css` (.tone-*). */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium leading-[1.35] whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'tone-neutral',
        accent: 'tone-accent',
        success: 'tone-success',
        warning: 'tone-warning',
        danger: 'tone-danger',
        info: 'tone-info',
        bare: 'text-fg-muted',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

const fieldStyles =
  'w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg transition-[border-color,box-shadow] placeholder:text-fg-subtle hover:border-border-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklch,var(--accent)_22%,transparent)] disabled:cursor-not-allowed disabled:opacity-55';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldStyles, 'h-8', className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldStyles, 'min-h-18 resize-y py-2 leading-relaxed', className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(fieldStyles, 'h-8 appearance-none pr-7', className)} {...props}>
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-fg-subtle"
      >
        <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-xs font-medium text-fg-muted', className)} {...props} />;
}

export function Separator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="separator" className={cn('h-px w-full bg-border', className)} {...props} />;
}

/** Barra de progreso discreta (compuerta de salida, métricas). */
export function Progress({
  value,
  max = 100,
  className,
  barClassName,
  label,
}: {
  value: number;
  max?: number;
  className?: string;
  barClassName?: string;
  label?: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className={cn('h-1 w-full overflow-hidden rounded-full bg-surface-3', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div
        className={cn('h-full rounded-full bg-accent transition-[width] duration-300', barClassName)}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/** Avatar de iniciales: el sistema no almacena fotos de personas. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[9px] font-semibold tracking-tight text-fg-muted ring-1 ring-border',
        className,
      )}
      aria-hidden="true"
      title={name}
    >
      {initials}
    </span>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="mt-1 text-xs text-fg-muted">{description}</p> : null}
    </div>
  );
}

/** Tecla de atajo, para que los atajos se puedan ver además de aprender. */
export function Kbd({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-4.5 min-w-4.5 items-center justify-center rounded border border-border bg-surface-2 px-1 font-mono text-[11px] font-medium text-fg-muted',
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}

/** Rótulo de sección: versalitas finas, como separador de bloques densos. */
export function SectionLabel({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle', className)}
      {...props}
    />
  );
}
