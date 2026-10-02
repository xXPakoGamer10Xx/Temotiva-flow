import type { Department, HelpStatus, HelpType, PriorityLevel, PriorityReason, StopReason } from '@/domain/enums';
import {
  DEPARTMENT_LABELS,
  DEPARTMENT_SHORT,
  HELP_TYPE_LABELS,
  PRIORITY_LABELS,
  PRIORITY_REASON_LABELS,
  STOP_REASON_LABELS,
} from '@/domain/labels';
import type { SleReading } from '@/server/services/sle';
import { sleLabel } from '@/server/services/sle';
import type { DependencyChip, FlowState } from '@/server/services/views';
import { Badge, Progress } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/**
 * Señales operativas del tablero: prioridad, reloj de SLE, parada, satélites de
 * dependencia y progreso de compuerta.
 *
 * Los pictogramas que la especificación fija literalmente (⛔, 🔗, ⏳, ✅, ⚠️,
 * 🟢, 🟡) se conservan, encajados en etiquetas translúcidas para que tengan un
 * tamaño y una línea base consistentes en toda la interfaz.
 */

/** Emoji de la especificación, alineado y a tamaño fijo. */
function Glyph({ children }: { children: string }) {
  return (
    <span aria-hidden="true" className="text-[11px] leading-none">
      {children}
    </span>
  );
}

const PRIORITY_TONE: Record<PriorityLevel, 'danger' | 'warning' | 'neutral' | 'bare'> = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  NORMAL: 'neutral',
  LOW: 'bare',
};

const PRIORITY_DOT: Record<PriorityLevel, string> = {
  CRITICAL: 'bg-[var(--danger)]',
  HIGH: 'bg-[var(--warning)]',
  NORMAL: 'bg-fg-subtle',
  LOW: 'bg-fg-subtle/60',
};

/** `Alta · Cliente B2B` — la prioridad nunca aparece sin su motivo. */
export function PriorityBadge({
  priority,
  reason,
  compact = false,
}: {
  priority: PriorityLevel;
  reason: PriorityReason;
  compact?: boolean;
}) {
  return (
    <Badge
      tone={PRIORITY_TONE[priority]}
      title={`Prioridad ${PRIORITY_LABELS[priority]} · ${PRIORITY_REASON_LABELS[reason]}`}
    >
      <span className={cn('size-1.5 rounded-full', PRIORITY_DOT[priority])} aria-hidden="true" />
      {PRIORITY_LABELS[priority]}
      {compact ? null : <span className="font-normal opacity-70">· {PRIORITY_REASON_LABELS[reason]}</span>}
    </Badge>
  );
}

const DEPARTMENT_DOT: Record<Department, string> = {
  PRODUCT: 'bg-sky-500',
  PSYCHOLOGY: 'bg-violet-500',
  LEGAL: 'bg-amber-500',
  DESIGN: 'bg-pink-500',
  TECH: 'bg-emerald-500',
  QA: 'bg-cyan-500',
  CYBER: 'bg-rose-500',
  HR: 'bg-orange-500',
  FINANCE: 'bg-lime-500',
  MARKETING: 'bg-fuchsia-500',
};

/** Color del departamento como `currentColor`, para teñir paneles (fondo y franja superior) del mismo tono que su punto. */
export const DEPARTMENT_ACCENT: Record<Department, string> = {
  PRODUCT: 'text-sky-500',
  PSYCHOLOGY: 'text-violet-500',
  LEGAL: 'text-amber-500',
  DESIGN: 'text-pink-500',
  TECH: 'text-emerald-500',
  QA: 'text-cyan-500',
  CYBER: 'text-rose-500',
  HR: 'text-orange-500',
  FINANCE: 'text-lime-500',
  MARKETING: 'text-fuchsia-500',
};

export function DepartmentChip({
  department,
  short = false,
  className,
}: {
  department: Department;
  short?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs text-fg-muted', className)}
      title={DEPARTMENT_LABELS[department]}
    >
      <span className={cn('size-1.5 rounded-full', DEPARTMENT_DOT[department])} aria-hidden="true" />
      {short ? DEPARTMENT_SHORT[department] : DEPARTMENT_LABELS[department]}
    </span>
  );
}

export function DepartmentDot({ department, className }: { department: Department; className?: string }) {
  return (
    <span
      className={cn('inline-block size-1.5 shrink-0 rounded-full', DEPARTMENT_DOT[department], className)}
      aria-hidden="true"
    />
  );
}

const SLE_DOT = {
  ON_TIME: 'bg-[var(--success)]',
  AT_RISK: 'bg-[var(--warning)]',
  EXCEEDED: 'bg-[var(--danger)]',
} as const;

const SLE_TEXT = {
  ON_TIME: 'text-fg-muted',
  AT_RISK: 'text-[var(--warning)]',
  EXCEEDED: 'text-[var(--danger)]',
} as const;

/** Reloj sobrio: un punto de color y el dato. Sin parpadeos (TemoFlow.md §3.1). */
export function SleClock({ reading, className }: { reading: SleReading; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs tabular-nums', SLE_TEXT[reading.state], className)}
    >
      <span className={cn('size-1.5 rounded-full', SLE_DOT[reading.state])} aria-hidden="true" />
      {sleLabel(reading)}
    </span>
  );
}

/** Franja superior de la tarjeta cuando la iniciativa está en parada. */
export function StopBanner({
  stopReason,
  description,
  className,
}: {
  stopReason: StopReason | null;
  description?: string | null;
  className?: string;
}) {
  return (
    <div className={cn('tone-danger flex items-start gap-1.5 px-3 py-1.5 text-xs leading-snug', className)}>
      <Glyph>⛔</Glyph>
      <span>
        <span className="font-medium">
          PARADA: {stopReason ? STOP_REASON_LABELS[stopReason] : 'sin causa declarada'}
        </span>
        {description ? <span className="mt-0.5 block opacity-80">{description}</span> : null}
      </span>
    </div>
  );
}

const HELP_STATUS_TEXT: Record<HelpStatus, string> = {
  PENDING: 'pendiente',
  RESOLVED: 'resuelta',
  REJECTED: 'rechazada',
};

const HELP_STATUS_GLYPH: Record<HelpStatus, string> = {
  PENDING: '⏳',
  RESOLVED: '✅',
  REJECTED: '✖️',
};

/** Satélites de dependencia: `🔗 Legal ⏳`, `🔗 Psico ✅`. */
export function DependencySatellites({ dependencies, max = 3 }: { dependencies: DependencyChip[]; max?: number }) {
  if (dependencies.length === 0) return null;
  const visible = dependencies.slice(0, max);
  const rest = dependencies.length - visible.length;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((dependency) => (
        <Badge
          key={dependency.id}
          tone={dependency.status === 'PENDING' ? (dependency.isBlocking ? 'danger' : 'info') : 'neutral'}
          title={`${DEPARTMENT_LABELS[dependency.department]} · ${HELP_TYPE_LABELS[dependency.helpType]}${
            dependency.isBlocking ? ' · bloqueante' : ''
          }`}
        >
          <Glyph>🔗</Glyph>
          {DEPARTMENT_SHORT[dependency.department]}
          <Glyph>{HELP_STATUS_GLYPH[dependency.status]}</Glyph>
          <span className="sr-only">{HELP_STATUS_TEXT[dependency.status]}</span>
        </Badge>
      ))}
      {rest > 0 ? <Badge tone="neutral">+{rest}</Badge> : null}
    </div>
  );
}

export function HelpTypeBadge({ helpType, isBlocking }: { helpType: HelpType; isBlocking: boolean }) {
  return (
    <Badge tone={isBlocking ? 'danger' : 'info'}>
      {HELP_TYPE_LABELS[helpType]}
      {isBlocking ? ' · bloqueante' : ''}
    </Badge>
  );
}

/** `Compuerta 3/5` con barra discreta. */
export function GateProgress({ completed, total }: { completed: number; total: number }) {
  const isComplete = total > 0 && completed === total;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-fg-subtle">
        <span>Compuerta</span>
        <span className={cn('tabular-nums', isComplete ? 'text-[var(--success)]' : 'text-fg-muted')}>
          {completed}/{total}
        </span>
      </div>
      <Progress
        value={completed}
        max={Math.max(total, 1)}
        barClassName={isComplete ? 'bg-[var(--success)]' : 'bg-accent'}
        label={`Compuerta de salida: ${completed} de ${total}`}
      />
    </div>
  );
}

const FLOW_STATE_META: Record<FlowState, { tone: 'danger' | 'warning' | 'success'; glyph: string; label: string }> = {
  BLOCKED: { tone: 'danger', glyph: '⛔', label: 'Parada' },
  PARALLEL: { tone: 'warning', glyph: '🟡', label: 'Avanzando en paralelo' },
  MOVING: { tone: 'success', glyph: '🟢', label: 'Avanzando' },
};

export function FlowStateBadge({ state }: { state: FlowState }) {
  const meta = FLOW_STATE_META[state];
  return (
    <Badge tone={meta.tone}>
      <Glyph>{meta.glyph}</Glyph>
      {meta.label}
    </Badge>
  );
}

/** Marca permanente de avance excepcional en la tarjeta. */
export function OverrideMarkBadge({ className }: { className?: string }) {
  return (
    <Badge tone="warning" className={className} title="Esta iniciativa avanzó saltando una compuerta">
      <Glyph>⚠️</Glyph>
      Avance excepcional
    </Badge>
  );
}
