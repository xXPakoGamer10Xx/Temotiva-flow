'use client';

import * as React from 'react';
import { ArrowRight, Send, TriangleAlert } from 'lucide-react';
import type { SessionContext } from '@/domain/types';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import { MIN_OVERRIDE_REASON, MIN_OVERRIDE_RISK, OVERRIDE_SIGNATURE } from '@/domain/rules';
import type { GateItemView, InitiativeDetailView } from '@/server/services/views';
import { advanceStageAction } from '@/server/actions/initiatives';
import { createDependencyAction, toggleChecklistItemAction } from '@/server/actions/collaboration';
import { ActionError, useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import { Badge, Input, Label, SectionLabel, Textarea } from '@/components/ui/primitives';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn, formatDateTime } from '@/lib/utils';
import type { InitiativeCapabilities } from './initiative-sheet';

/**
 * Pestaña Compuerta de Salida (TemoFlow.md §1.3).
 *
 * Con requisitos pendientes el botón de avance no falla en silencio: despliega
 * el panel con lo que falta, a quién pedírselo en un clic y la vía de avance
 * excepcional para quien tiene rango para firmarla.
 */
export function GateTab({
  detail,
  session,
  capabilities,
}: {
  detail: InitiativeDetailView;
  session: SessionContext;
  capabilities: InitiativeCapabilities;
}) {
  const { card, gate, nextStage } = detail;
  const toggle = useAction(toggleChecklistItemAction);
  const advance = useAction(advanceStageAction);
  const request = useAction(createDependencyAction, { success: 'Solicitud enviada al departamento responsable' });

  const [panelOpen, setPanelOpen] = React.useState(false);
  const [overrideOpen, setOverrideOpen] = React.useState(false);
  const [advanced, setAdvanced] = React.useState<string | null>(null);

  const canToggle = (item: GateItemView): boolean =>
    !card.isArchived && (session.role === 'EXECUTIVE' || session.departments.includes(item.responsibleDepartment));

  const tryAdvance = (): void => {
    if (!gate.isComplete) {
      setPanelOpen(true);
      return;
    }
    advance.run({ initiativeId: card.id }, (data) => {
      if (data.status === 'ADVANCED') setAdvanced(data.toStageName ?? null);
      else setPanelOpen(true);
    });
  };

  const requestToDepartment = (item: GateItemView): void => {
    request.run({
      initiativeId: card.id,
      targetDepartment: item.responsibleDepartment,
      helpType: 'VALIDATION',
      description: `Falta cerrar el requisito «${item.label}» para poder avanzar a ${nextStage?.name ?? 'la siguiente fase'}.`,
      isBlocking: false,
      checklistItemId: item.id,
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-fg-muted">{detail.stage.purpose}</p>

      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {gate.items.map((item) => (
          <li
            key={item.id}
            className={cn('flex items-start gap-2.5 px-3 py-2.5', item.isCompleted && 'bg-surface-2/40')}
          >
            <Checkbox
              checked={item.isCompleted}
              disabled={!canToggle(item) || toggle.isPending}
              id={`gate-${item.id}`}
              onCheckedChange={(checked) =>
                toggle.run({
                  initiativeId: card.id,
                  checklistItemId: item.id,
                  isCompleted: checked === true,
                })
              }
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <label
                htmlFor={`gate-${item.id}`}
                className={cn(
                  'block text-sm leading-snug',
                  item.isCompleted ? 'text-fg-muted line-through' : 'font-medium text-fg',
                )}
              >
                {item.label}
              </label>
              {item.description ? (
                <p className="text-xs leading-relaxed text-fg-subtle">{item.description}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
                <Badge tone={item.isCompleted ? 'success' : 'neutral'}>
                  {DEPARTMENT_LABELS[item.responsibleDepartment]}
                </Badge>
                {item.isCompleted && item.completedBy ? (
                  <span>
                    {item.completedBy.name} · {item.completedAt ? formatDateTime(item.completedAt) : ''}
                  </span>
                ) : !canToggle(item) ? (
                  <span>Lo marca {DEPARTMENT_LABELS[item.responsibleDepartment]}</span>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <ActionError message={toggle.error} />
      <ActionError message={advance.error} />

      {advanced ? (
        <p className="tone-success rounded-md px-2.5 py-1.5 text-xs">
          Iniciativa avanzada a {advanced}. La propiedad pasa al departamento de la nueva fase.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2.5">
        {nextStage ? (
          <Button
            onClick={tryAdvance}
            disabled={advance.isPending || card.isArchived || !capabilities.canAdvance}
            title={
              capabilities.canAdvance
                ? undefined
                : `Solo ${capabilities.ownerLabel}, propietaria de la fase, puede avanzarla`
            }
          >
            {gate.isComplete ? (
              <>
                <ArrowRight className="size-3.5" />
                Avanzar a {nextStage.name}
              </>
            ) : (
              <>
                <span aria-hidden="true" className="text-xs leading-none">
                  🔒
                </span>
                Avanzar Fase ({gate.total - gate.completed} pendientes)
              </>
            )}
          </Button>
        ) : (
          <Badge tone="success">Última fase del ciclo</Badge>
        )}
        {nextStage ? (
          <span className="text-xs text-fg-subtle">
            {capabilities.canAdvance
              ? `Al avanzar, la propiedad pasa a ${DEPARTMENT_LABELS[nextStage.defaultOwnerDepartment]}.`
              : `La avanza ${capabilities.ownerLabel}, que es quien tiene el trabajo en esta fase.`}
          </span>
        ) : null}
      </div>

      {panelOpen && !gate.isComplete && nextStage ? (
        <div className="space-y-2.5 rounded-lg border border-border bg-surface-2/50 p-3">
          <div>
            <p className="text-sm font-medium">Para pasar a {nextStage.name}, faltan estos requisitos:</p>
            <p className="mt-0.5 text-xs text-fg-muted">
              Pídeselos al departamento responsable en un clic, o registra un avance excepcional.
            </p>
          </div>

          <ul className="space-y-1.5">
            {gate.items
              .filter((item) => !item.isCompleted && item.isMandatory)
              .map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5"
                >
                  <span className="text-xs">
                    <span aria-hidden="true" className="text-fg-subtle">
                      ☐
                    </span>{' '}
                    {item.label}
                    <span className="ml-1.5 text-fg-subtle">· {DEPARTMENT_LABELS[item.responsibleDepartment]}</span>
                  </span>
                  {item.linkedDependencyId ? (
                    <Badge tone="info">Ya solicitado</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={request.isPending}
                      onClick={() => requestToDepartment(item)}
                    >
                      <Send className="size-3" />
                      Solicitar a {DEPARTMENT_LABELS[item.responsibleDepartment]}
                    </Button>
                  )}
                </li>
              ))}
          </ul>

          <ActionError message={request.error} />

          {capabilities.canOverride ? (
            <Button variant="danger" size="sm" onClick={() => setOverrideOpen(true)}>
              <span aria-hidden="true" className="text-xs leading-none">
                🚨
              </span>
              Solicitar Avance Excepcional
            </Button>
          ) : (
            <p className="text-xs text-fg-subtle">
              El avance excepcional lo firma el responsable de {DEPARTMENT_LABELS[card.ownerDepartment]} o Dirección.
            </p>
          )}
        </div>
      ) : null}

      {overrideOpen && nextStage ? (
        <OverrideDialog
          detail={detail}
          onClose={() => setOverrideOpen(false)}
          onDone={(stageName) => {
            setOverrideOpen(false);
            setPanelOpen(false);
            setAdvanced(stageName);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Formulario bloqueante de responsabilidad (TemoFlow.md §2.2): requisitos
 * incumplidos reconocidos uno a uno, motivo, riesgo asumido y firma literal.
 */
function OverrideDialog({
  detail,
  onClose,
  onDone,
}: {
  detail: InitiativeDetailView;
  onClose: () => void;
  onDone: (stageName: string | null) => void;
}) {
  const advance = useAction(advanceStageAction);
  const pending = detail.gate.items.filter((item) => !item.isCompleted && item.isMandatory);

  const [acknowledged, setAcknowledged] = React.useState<string[]>([]);
  const [reason, setReason] = React.useState('');
  const [risk, setRisk] = React.useState('');
  const [signature, setSignature] = React.useState('');

  const allAcknowledged = pending.length > 0 && acknowledged.length === pending.length;
  const signatureOk = signature.trim().toUpperCase() === OVERRIDE_SIGNATURE;
  const canSubmit =
    allAcknowledged &&
    reason.trim().length >= MIN_OVERRIDE_REASON &&
    risk.trim().length >= MIN_OVERRIDE_RISK &&
    signatureOk &&
    !advance.isPending;

  const submit = (): void => {
    advance.run(
      {
        initiativeId: detail.card.id,
        override: {
          reason,
          riskAccepted: risk,
          signature,
          acknowledgedPendingIds: acknowledged,
        },
      },
      (data) => onDone(data.status === 'ADVANCED' ? (data.toStageName ?? null) : null),
    );
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="w-[min(38rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5 text-[var(--danger)]">
            <TriangleAlert className="size-4" />
            Avance excepcional
          </DialogTitle>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            {detail.stage.name} ➔ {detail.nextStage?.name}. Queda registrado de forma permanente e inmutable en la caja
            negra, con tu identidad, tu IP y el dispositivo desde el que firmas.
          </p>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <SectionLabel>Requisitos que quedan incumplidos</SectionLabel>
            <ul className="space-y-1">
              {pending.map((item) => (
                <li key={item.id} className="flex items-start gap-2 rounded-md border border-border px-2.5 py-2">
                  <Checkbox
                    id={`ack-${item.id}`}
                    checked={acknowledged.includes(item.id)}
                    onCheckedChange={(checked) =>
                      setAcknowledged((current) =>
                        checked === true ? [...current, item.id] : current.filter((id) => id !== item.id),
                      )
                    }
                    className="mt-0.5"
                  />
                  <label htmlFor={`ack-${item.id}`} className="text-xs leading-snug">
                    {item.label}
                    <span className="ml-1 text-fg-subtle">· {DEPARTMENT_LABELS[item.responsibleDepartment]}</span>
                  </label>
                </li>
              ))}
            </ul>
            {!allAcknowledged ? (
              <p className="text-xs text-fg-subtle">
                Debes reconocer todos los requisitos incumplidos antes de firmar.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="override-reason">Motivo de la excepción</Label>
            <Textarea
              id="override-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Por qué el negocio necesita avanzar sin cerrar la compuerta"
            />
            <p className="text-xs tabular-nums text-fg-subtle">
              {reason.trim().length}/{MIN_OVERRIDE_REASON} caracteres mínimos
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="override-risk">Riesgo asumido</Label>
            <Textarea
              id="override-risk"
              rows={3}
              value={risk}
              onChange={(event) => setRisk(event.target.value)}
              placeholder="Impacto técnico, clínico o legal que se acepta explícitamente"
            />
            <p className="text-xs tabular-nums text-fg-subtle">
              {risk.trim().length}/{MIN_OVERRIDE_RISK} caracteres mínimos
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="override-signature">
              Firma: escribe <span className="font-mono font-medium text-fg">{OVERRIDE_SIGNATURE}</span>
            </Label>
            <Input
              id="override-signature"
              value={signature}
              onChange={(event) => setSignature(event.target.value)}
              placeholder={OVERRIDE_SIGNATURE}
              autoComplete="off"
              className="font-mono"
            />
          </div>

          <ActionError message={advance.error} />
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={!canSubmit} onClick={submit}>
            {advance.isPending ? 'Registrando…' : 'Firmar y forzar avance'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
