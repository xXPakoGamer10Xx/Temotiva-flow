'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { SessionContext } from '@/domain/types';
import { TSHIRT_SIZES, type TshirtSize } from '@/domain/enums';
import { DEPARTMENT_LABELS, SIGNOFF_REQUIREMENT_HINTS, TSHIRT_SIZE_LABELS } from '@/domain/labels';
import {
  MAX_CUSTOM_CHECK_LABEL,
  MAX_CUSTOM_CHECK_NOTE,
  MAX_SIGNOFF_NOTE,
  MIN_CUSTOM_CHECK_LABEL,
  SIGNOFF_APPROVED_PREFIX,
} from '@/domain/rules';
import { validateSignoffPayload } from '@/domain/signoffs';
import type { CustomCheckView, SignoffView } from '@/server/services/views';
import {
  addCustomCheckAction,
  removeCustomCheckAction,
  setCustomCheckStateAction,
  setStageSignoffAction,
} from '@/server/actions/signoffs';
import { ActionError, useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import { Badge, Input, Label, Textarea } from '@/components/ui/primitives';
import { cn, formatDateTime } from '@/lib/utils';

/**
 * Aprobación obligatoria de un área (spec 005 §5.4). Aprobada se lee
 * «APROBADO AL 100% POR: Nombre»; quién aprueba lo decide la sesión en el
 * servidor, nunca el formulario.
 */
export function SignoffSummary({ signoff }: { signoff: SignoffView }) {
  return (
    <div className="space-y-1">
      {signoff.isApproved ? (
        <p className="text-sm font-medium text-fg">
          <span aria-hidden="true" className="mr-1 text-xs leading-none">
            ✅
          </span>
          {SIGNOFF_APPROVED_PREFIX} {signoff.approvedBy?.name ?? 'Persona retirada'}
          {signoff.onBehalf ? (
            <Badge tone="accent" className="ml-1.5 align-middle">
              Dirección
            </Badge>
          ) : null}
        </p>
      ) : (
        <p className="text-sm text-fg-muted">Pendiente de aprobación de {DEPARTMENT_LABELS[signoff.department]}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
        <Badge tone={signoff.isSatisfied ? 'success' : 'neutral'}>{DEPARTMENT_LABELS[signoff.department]}</Badge>
        {signoff.approvedAt ? <span className="tabular-nums">{formatDateTime(signoff.approvedAt)}</span> : null}
        {signoff.tshirtSize ? <Badge tone="info">T-shirt {TSHIRT_SIZE_LABELS[signoff.tshirtSize]}</Badge> : null}
        {signoff.noObservations ? <Badge tone="neutral">Sin observaciones</Badge> : null}
      </div>
      {signoff.note ? (
        <p className="whitespace-pre-line text-xs leading-relaxed text-fg-muted">{signoff.note}</p>
      ) : null}
    </div>
  );
}

export function SignoffRow({
  initiativeId,
  signoff,
  session,
  disabled,
}: {
  initiativeId: string;
  signoff: SignoffView;
  session: SessionContext;
  disabled: boolean;
}) {
  const action = useAction(setStageSignoffAction);
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [noObservations, setNoObservations] = React.useState(false);
  const [tshirtSize, setTshirtSize] = React.useState<TshirtSize | null>(null);

  const canSign = !disabled && (session.role === 'EXECUTIVE' || session.departments.includes(signoff.department));
  const problem = validateSignoffPayload(signoff.requirement, { note, noObservations, tshirtSize });
  const hint = SIGNOFF_REQUIREMENT_HINTS[signoff.requirement];

  const approve = (): void => {
    action.run(
      {
        initiativeId,
        stageId: signoff.stageId,
        department: signoff.department,
        approved: true,
        note: note.trim() || null,
        noObservations,
        tshirtSize,
      },
      () => setOpen(false),
    );
  };

  return (
    <li className={cn('space-y-2 px-3 py-2.5', signoff.isSatisfied && 'bg-surface-2/40')}>
      <div className="flex items-start justify-between gap-3">
        <SignoffSummary signoff={signoff} />
        {canSign ? (
          signoff.isApproved ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={action.isPending}
              onClick={() =>
                action.run({ initiativeId, stageId: signoff.stageId, department: signoff.department, approved: false })
              }
            >
              Retirar
            </Button>
          ) : !open ? (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              Aprobar
            </Button>
          ) : null
        ) : !signoff.isApproved ? (
          <span className="shrink-0 text-xs text-fg-subtle">La aprueba {DEPARTMENT_LABELS[signoff.department]}</span>
        ) : null}
      </div>

      {open && canSign && !signoff.isApproved ? (
        <form
          className="space-y-2 rounded-md border border-border bg-surface p-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!problem) approve();
          }}
        >
          {hint ? <p className="text-xs text-fg-muted">{hint}</p> : null}

          {signoff.requirement === 'TSHIRT' ? (
            <fieldset className="space-y-1">
              <legend className="text-xs font-medium text-fg">Talla de esfuerzo</legend>
              <div role="radiogroup" aria-label="Talla T-shirt" className="flex flex-wrap gap-1">
                {TSHIRT_SIZES.map((size) => (
                  <Button
                    key={size}
                    type="button"
                    size="sm"
                    role="radio"
                    aria-checked={tshirtSize === size}
                    variant={tshirtSize === size ? 'default' : 'outline'}
                    onClick={() => setTshirtSize(size)}
                    className="min-w-10 tabular-nums"
                  >
                    {TSHIRT_SIZE_LABELS[size]}
                  </Button>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="space-y-1">
            <Label htmlFor={`signoff-note-${signoff.id}`}>
              {signoff.requirement === 'NOTE_OR_NO_OBSERVATIONS' ? 'Consideraciones' : 'Nota (opcional)'}
            </Label>
            <Textarea
              id={`signoff-note-${signoff.id}`}
              rows={3}
              value={note}
              maxLength={MAX_SIGNOFF_NOTE}
              disabled={noObservations}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                signoff.requirement === 'NOTE_OR_NO_OBSERVATIONS'
                  ? 'Riesgos, condiciones o requisitos que deben cumplirse'
                  : 'Lo que el área quiere dejar por escrito'
              }
            />
          </div>

          {signoff.requirement === 'NOTE_OR_NO_OBSERVATIONS' ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id={`signoff-noobs-${signoff.id}`}
                checked={noObservations}
                onCheckedChange={(checked) => {
                  setNoObservations(checked === true);
                  if (checked === true) setNote('');
                }}
              />
              <label htmlFor={`signoff-noobs-${signoff.id}`} className="text-xs">
                Sin observaciones
              </label>
            </div>
          ) : null}

          {problem && (note.trim() || noObservations || tshirtSize) ? (
            <p className="text-xs text-fg-subtle">{problem}</p>
          ) : null}
          <ActionError message={action.error} />

          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={Boolean(problem) || action.isPending}>
              {action.isPending ? 'Registrando…' : 'Aprobar al 100%'}
            </Button>
          </div>
        </form>
      ) : (
        <ActionError message={action.error} />
      )}
    </li>
  );
}

/** Casillas adicionales opcionales de la fase (spec 005 §5.6): nunca bloquean. */
export function CustomChecksSection({
  initiativeId,
  checks,
  canManage,
  disabled,
}: {
  initiativeId: string;
  checks: CustomCheckView[];
  canManage: boolean;
  disabled: boolean;
}) {
  const add = useAction(addCustomCheckAction);
  const toggle = useAction(setCustomCheckStateAction);
  const remove = useAction(removeCustomCheckAction);
  const [adding, setAdding] = React.useState(false);
  const [label, setLabel] = React.useState('');
  const [note, setNote] = React.useState('');
  const editable = canManage && !disabled;

  if (checks.length === 0 && !editable) return null;

  return (
    <div className="space-y-1.5">
      {checks.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {checks.map((check) => (
            <li key={check.id} className="flex items-start gap-2.5 px-3 py-2">
              <Checkbox
                id={`custom-${check.id}`}
                checked={check.isCompleted}
                disabled={!editable || toggle.isPending}
                onCheckedChange={(checked) => toggle.run({ checkId: check.id, isCompleted: checked === true })}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <label
                  htmlFor={`custom-${check.id}`}
                  className={cn('block text-sm leading-snug', check.isCompleted && 'text-fg-muted line-through')}
                >
                  {check.label}
                </label>
                {check.note ? <p className="text-xs leading-relaxed text-fg-subtle">{check.note}</p> : null}
                <p className="text-xs text-fg-subtle">
                  {check.isCompleted && check.completedBy
                    ? `${check.completedBy.name} · ${check.completedAt ? formatDateTime(check.completedAt) : ''}`
                    : `Añadida por ${check.createdBy?.name ?? '—'}`}
                </p>
              </div>
              {editable ? (
                <Button
                  size="iconSm"
                  variant="ghost"
                  aria-label={`Retirar «${check.label}»`}
                  disabled={remove.isPending}
                  onClick={() => remove.run({ checkId: check.id })}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <ActionError message={toggle.error ?? remove.error} />

      {editable && adding ? (
        <form
          className="space-y-2 rounded-md border border-border bg-surface p-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            add.run({ initiativeId, label, note: note.trim() || null }, () => {
              setLabel('');
              setNote('');
              setAdding(false);
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="custom-check-label">Casilla</Label>
            <Input
              id="custom-check-label"
              autoFocus
              value={label}
              maxLength={MAX_CUSTOM_CHECK_LABEL}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Qué hay que comprobar"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="custom-check-note">Nota (opcional)</Label>
            <Input
              id="custom-check-note"
              value={note}
              maxLength={MAX_CUSTOM_CHECK_NOTE}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Detalle breve"
            />
          </div>
          <ActionError message={add.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={label.trim().length < MIN_CUSTOM_CHECK_LABEL || add.isPending}>
              Añadir casilla
            </Button>
          </div>
        </form>
      ) : editable ? (
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
          <Plus />
          Añadir casilla
        </Button>
      ) : null}
    </div>
  );
}
