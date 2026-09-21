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
 * dependencia y progreso de compuerta. Todas son componentes de servidor: no
 * necesitan estado, solo pintar lo que el dominio ya calculó.
 */

const PRIORITY_TONE: Record<PriorityLevel, 'danger' | 'warning' | 'neutral' | 'outline'> = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  NORMAL: 'neutral',
  LOW: 'outline',
};

const PRIORITY_DOT: Record<PriorityLevel, string> = {
  CRITICAL: 'bg-danger',
  HIGH: 'bg-warning',
  NORMAL: 'bg-muted-foreground/60',
  LOW: 'bg-muted-foreground/35',
};

/** `🔴 Alta · Cliente B2B` — prioridad siempre acompañada de su motivo. */
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
    <Badge tone={PRIORITY_TONE[priority]} title={`Prioridad ${PRIORITY_LABELS[priority]} · ${PRIORITY_REASON_LABELS[reason]}`}>
      <span className={cn('size-1.5 rounded-full', PRIORITY_DOT[priority])} aria-hidden="true" />
      {PRIORITY_LABELS[priority]}
      {compact ? null : <span className="font-normal opacity-80">· {PRIORITY_REASON_LABELS[reason]}</span>}
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
      className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}
      title={DEPARTMENT_LABELS[department]}
    >
      <span className={cn('size-2 rounded-full', DEPARTMENT_DOT[department])} aria-hidden="true" />
      {short ? DEPARTMENT_SHORT[department] : DEPARTMENT_LABELS[department]}
    </span>
  );
}

const SLE_DOT = {
  ON_TIME: 'bg-success',
  AT_RISK: 'bg-warning',
  EXCEEDED: 'bg-danger',
} as const;

const SLE_TEXT = {
  ON_TIME: 'text-muted-foreground',
  AT_RISK: 'text-warning',
  EXCEEDED: 'text-danger',
} as const;

/** Reloj sobrio: un punto de color y el dato. Sin parpadeos (TemoFlow.md §3.1). */
export function SleClock({ reading, className }: { reading: SleReading; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', SLE_TEXT[reading.state], className)}>
      <span className={cn('size-2 rounded-full', SLE_DOT[reading.state])} aria-hidden="true" />
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
    <div
      className={cn(
        'flex items-start gap-2 rounded-t-lg border-b border-danger/30 bg-danger-soft px-3 py-1.5 text-[11px] font-medium text-danger',
        className,
      )}
    >
      <span aria-hidden="true">⛔</span>
      <span className="leading-snug">
        PARADA: {stopReason ? STOP_REASON_LABELS[stopReason] : 'sin causa declarada'}
        {description ? <span className="block font-normal opacity-90">{description}</span> : null}
      </span>
    </div>
  );
}

const HELP_STATUS_ICON: Record<HelpStatus, string> = {
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
          <span aria-hidden="true">🔗</span>
          {DEPARTMENT_SHORT[dependency.department]}
          <span aria-hidden="true">{HELP_STATUS_ICON[dependency.status]}</span>
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

/** `Compuerta: 3/5` con barra discreta. */
export function GateProgress({ completed, total }: { completed: number; total: number }) {
  const isComplete = total > 0 && completed === total;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Compuerta</span>
        <span className={cn('font-medium tabular-nums', isComplete ? 'text-success' : 'text-foreground')}>
          {completed}/{total}
        </span>
      </div>
      <Progress
        value={completed}
        max={Math.max(total, 1)}
        barClassName={isComplete ? 'bg-success' : 'bg-primary'}
        label={`Compuerta de salida: ${completed} de ${total}`}
      />
    </div>
  );
}

const FLOW_STATE_META: Record<FlowState, { tone: 'danger' | 'warning' | 'success'; icon: string; label: string }> = {
  BLOCKED: { tone: 'danger', icon: '⛔', label: 'Parada' },
  PARALLEL: { tone: 'warning', icon: '🟡', label: 'Avanzando en paralelo' },
  MOVING: { tone: 'success', icon: '🟢', label: 'Avanzando' },
};

export function FlowStateBadge({ state }: { state: FlowState }) {
  const meta = FLOW_STATE_META[state];
  return (
    <Badge tone={meta.tone}>
      <span aria-hidden="true">{meta.icon}</span>
      {meta.label}
    </Badge>
  );
}

/** Marca permanente de avance excepcional en la tarjeta. */
export function OverrideMarkBadge({ className }: { className?: string }) {
  return (
    <Badge tone="warning" className={className} title="Esta iniciativa avanzó saltando una compuerta">
      <span aria-hidden="true">⚠️</span>
      Avance excepcional
    </Badge>
  );
}
