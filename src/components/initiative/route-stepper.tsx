'use client';

import * as React from 'react';
import { Plus, X } from 'lucide-react';
import type { SessionContext } from '@/domain/types';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import { MIN_STAGE_SKIP_REASON } from '@/domain/rules';
import type { RouteStepView } from '@/server/services/views';
import { restoreStageAction, skipStageAction } from '@/server/actions/initiatives';
import { MAX_PERSONAL_STEP_TITLE } from '@/domain/rules';
import {
  addPersonalStepAction,
  removePersonalStepAction,
  setPersonalStepDoneAction,
} from '@/server/actions/personal-steps';
import type { PersonalStepView } from '@/server/services/personal-steps';
import { ActionError, useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/primitives';
import { cn, formatDateTime } from '@/lib/utils';

/** Quién puede omitir: LEAD del área dueña de la fase o Dirección. El servidor lo revalida. */
export function canSkipRouteStep(session: SessionContext, step: RouteStepView): boolean {
  return (
    session.role === 'EXECUTIVE' ||
    (session.role === 'LEAD' && session.departments.includes(step.defaultOwnerDepartment))
  );
}

/**
 * Ruta de fases de la iniciativa. Las fases que no aplican aparecen tachadas
 * con su motivo; las futuras ofrecen "No aplica" / "Volver a incluir" a quien
 * puede decidirlo.
 */
export function RouteStepper({
  initiativeId,
  route,
  session,
  disabled,
  personalSteps,
}: {
  initiativeId: string;
  route: RouteStepView[];
  session: SessionContext;
  disabled: boolean;
  personalSteps: PersonalStepView[];
}) {
  const skip = useAction(skipStageAction, { success: 'Ruta actualizada' });
  const restore = useAction(restoreStageAction, { success: 'Ruta actualizada' });
  const [target, setTarget] = React.useState<RouteStepView | null>(null);
  const [reason, setReason] = React.useState('');

  const action = target?.status === 'SKIPPED' ? restore : skip;
  const close = (): void => {
    setTarget(null);
    setReason('');
    skip.setError(null);
    restore.setError(null);
  };
  const canSubmit = reason.trim().length >= MIN_STAGE_SKIP_REASON && !action.isPending;

  const applicable = route.filter((step) => step.status !== 'SKIPPED').length;

  return (
    <div className="space-y-2">
      <SectionRow applicable={applicable} total={route.length} />
      <ol className="space-y-1">
        {route.map((step) => (
          <React.Fragment key={step.stageId}>
          <li
            className={cn(
              'flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md px-2 py-1 text-xs',
              step.status === 'CURRENT' && 'tone-accent font-medium',
              step.status === 'SKIPPED' && 'text-fg-subtle',
              step.status === 'DONE' && 'text-fg-muted',
            )}
          >
            <span aria-hidden>{step.status === 'DONE' ? '✅' : step.status === 'CURRENT' ? '●' : step.status === 'SKIPPED' ? '–' : '○'}</span>
            <span className={cn(step.status === 'SKIPPED' && 'line-through')}>{step.name}</span>
            {step.status === 'SKIPPED' ? <span className="tone-neutral rounded px-1">No aplica</span> : null}
            {step.skip ? (
              <span className="basis-full pl-5 text-fg-subtle [overflow-wrap:anywhere]">
                {step.skip.reason} · {step.skip.by} · {formatDateTime(step.skip.at)}
              </span>
            ) : null}
            {!disabled && (step.status === 'SKIPPED' || (step.status === 'FUTURE' && step.isSkippable)) && canSkipRouteStep(session, step) ? (
              <button
                type="button"
                onClick={() => setTarget(step)}
                className="ml-auto text-accent-text underline-offset-4 hover:underline"
              >
                {step.status === 'SKIPPED' ? 'Volver a incluir' : 'Marcar como No aplica'}
              </button>
            ) : null}
          </li>
          {personalSteps
            .filter((personal) => personal.afterStageId === step.stageId)
            .map((personal) => (
              <PersonalStepRow key={personal.id} step={personal} />
            ))}
          </React.Fragment>
        ))}
      </ol>

      <PersonalStepAdder initiativeId={initiativeId} route={route} disabled={disabled} />

      {target ? (
        <Dialog open onOpenChange={(open) => (open ? undefined : close())}>
          <DialogContent className="w-[min(30rem,calc(100vw-2rem))]">
            <DialogHeader>
              <DialogTitle>
                {target.status === 'SKIPPED' ? `Volver a incluir ${target.name}` : `${target.name}: No aplica`}
              </DialogTitle>
              <p className="mt-1 text-xs text-fg-muted">
                Queda registrado en la caja negra con tu nombre. Decide {DEPARTMENT_LABELS[target.defaultOwnerDepartment]} (responsable) o Dirección.
              </p>
            </DialogHeader>
            <form
              className="contents"
              onSubmit={(event) => {
                event.preventDefault();
                if (!canSubmit) return;
                action.run({ initiativeId, stageId: target.stageId, reason }, close);
              }}
            >
              <DialogBody className="space-y-2">
                <Label htmlFor="route-reason">Motivo (mínimo {MIN_STAGE_SKIP_REASON} caracteres)</Label>
                <Textarea id="route-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} autoFocus />
                <ActionError message={action.error} />
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="ghost" size="sm" onClick={close}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={!canSubmit}>
                  Confirmar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function SectionRow({ applicable, total }: { applicable: number; total: number }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">
      Ruta · <span className="tabular-nums">{applicable}</span> de <span className="tabular-nums">{total}</span> fases
    </p>
  );
}

function PersonalStepRow({ step }: { step: PersonalStepView }) {
  const toggle = useAction(setPersonalStepDoneAction);
  const remove = useAction(removePersonalStepAction);

  return (
    <li className="ml-4 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-dashed border-border px-2 py-1 text-xs">
      <input
        type="checkbox"
        checked={step.isDone}
        disabled={toggle.isPending}
        onChange={(event) => toggle.run({ stepId: step.id, isDone: event.target.checked })}
        aria-label={`Marcar «${step.title}» como hecho`}
        className="size-3.5 accent-[var(--accent)]"
      />
      <span className={cn('min-w-0 flex-1 [overflow-wrap:anywhere]', step.isDone && 'text-fg-subtle line-through')}>
        {step.title}
      </span>
      <span className="tone-neutral rounded px-1" title="Solo tú ves este paso">
        Solo tú
      </span>
      <button
        type="button"
        disabled={remove.isPending}
        onClick={() => remove.run({ stepId: step.id })}
        className="text-fg-subtle hover:text-fg"
        aria-label={`Quitar «${step.title}»`}
      >
        <X className="size-3.5" />
      </button>
      <ActionError message={toggle.error ?? remove.error} />
    </li>
  );
}

/** Formulario para añadir un paso propio, tras la fase que se elija (por defecto la actual). */
function PersonalStepAdder({
  initiativeId,
  route,
  disabled,
}: {
  initiativeId: string;
  route: RouteStepView[];
  disabled: boolean;
}) {
  const add = useAction(addPersonalStepAction, { success: 'Paso añadido (solo tú lo ves)' });
  const currentId = route.find((step) => step.status === 'CURRENT')?.stageId ?? route[0]?.stageId ?? 0;
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [afterStageId, setAfterStageId] = React.useState(currentId);

  if (disabled) return null;
  if (!open) {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Añadir paso propio
      </Button>
    );
  }

  const canSubmit = title.trim().length >= 2 && !add.isPending;
  return (
    <form
      className="space-y-2 rounded-md border border-border p-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        add.run({ initiativeId, afterStageId, title }, () => {
          setTitle('');
          setOpen(false);
        });
      }}
    >
      <p className="text-xs text-fg-muted">
        Un paso solo tuyo en la ruta de esta iniciativa. Nadie más lo ve y no afecta a la compuerta.
      </p>
      <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
        <Input
          aria-label="Nombre del paso propio"
          value={title}
          maxLength={MAX_PERSONAL_STEP_TITLE}
          placeholder="Nombre del paso"
          onChange={(event) => setTitle(event.target.value)}
          autoFocus
        />
        <Select
          aria-label="Mostrar tras la fase"
          value={afterStageId}
          onChange={(event) => setAfterStageId(Number(event.target.value))}
        >
          {route.map((step) => (
            <option key={step.stageId} value={step.stageId}>
              Tras {step.name}
            </option>
          ))}
        </Select>
      </div>
      <ActionError message={add.error} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!canSubmit}>
          Añadir
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
