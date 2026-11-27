'use client';

import * as React from 'react';
import { ArrowRight, ChevronRight, Flag, Send, TriangleAlert } from 'lucide-react';
import type { SessionContext } from '@/domain/types';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import { MIN_OVERRIDE_REASON, MIN_OVERRIDE_RISK, MIN_STAGE_ADVANCE_NOTE, OVERRIDE_SIGNATURE } from '@/domain/rules';
import type { GateItemView, InitiativeDetailView, SignoffView } from '@/server/services/views';
import { advanceStageAction, finalizeInitiativeAction } from '@/server/actions/initiatives';
import { createDependencyAction, toggleChecklistItemAction } from '@/server/actions/collaboration';
import { ActionError, useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import { Badge, Input, Label, SectionLabel, Textarea } from '@/components/ui/primitives';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn, formatDateTime } from '@/lib/utils';
import type { InitiativeCapabilities } from './initiative-sheet';
import { InfoHint } from '@/components/help/info-hint';
import type { PersonalStepView } from '@/server/services/personal-steps';
import { RouteStepper } from './route-stepper';
import { CustomChecksSection, SignoffRow } from './signoff-panel';
import { StageNoteDialog } from './stage-note-dialog';

/**
 * Pestaña Compuerta de Salida (TemoFlow.md §1.3, spec 005 §5.3).
 *
 * Bloquean las aprobaciones de área («APROBADO AL 100% POR: …»). Las casillas
 * adicionales y la guía de la fase nunca bloquean. Con aprobaciones
 * pendientes el botón de avance no falla en silencio: despliega el panel con lo
 * que falta, a quién pedírselo en un clic y la vía de avance excepcional.
 * Todo avance (y la finalización) pide la nota de lo que se hizo en la fase.
 */
export function GateTab({
  detail,
  session,
  capabilities,
  personalSteps,
}: {
  detail: InitiativeDetailView;
  session: SessionContext;
  capabilities: InitiativeCapabilities;
  personalSteps: PersonalStepView[];
}) {
  const { card, gate, nextStage } = detail;
  const closed = card.isArchived || card.isFinalized;
  const isLastStage = !nextStage;
  const skippedAhead = nextStage
    ? detail.route
        .slice(0, detail.route.findIndex((step) => step.stageId === nextStage.id))
        .filter((step) => step.status === 'SKIPPED')
        .map((step) => step.name)
    : [];
  const toggle = useAction(toggleChecklistItemAction);
  const advance = useAction(advanceStageAction);
  const finalize = useAction(finalizeInitiativeAction, { success: `${card.id} finalizada` });
  const request = useAction(createDependencyAction, { success: 'Solicitud enviada al departamento responsable' });

  const [panelOpen, setPanelOpen] = React.useState(false);
  const [overrideOpen, setOverrideOpen] = React.useState(false);
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [advanced, setAdvanced] = React.useState<string | null>(null);

  const pendingSignoffs = detail.signoffs.filter((signoff) => !signoff.isSatisfied);
  const guideDone = gate.items.filter((item) => item.isCompleted).length;

  const canToggle = (item: GateItemView): boolean =>
    !closed && (session.role === 'EXECUTIVE' || session.departments.includes(item.responsibleDepartment));

  const tryAdvance = (): void => {
    if (!gate.isComplete) {
      setPanelOpen(true);
      return;
    }
    setNoteOpen(true);
  };

  const submitNote = (note: string): void => {
    if (isLastStage) {
      finalize.run({ initiativeId: card.id, note }, (data) => {
        if (data.status === 'FINALIZED') setNoteOpen(false);
        else {
          setNoteOpen(false);
          setPanelOpen(true);
        }
      });
      return;
    }
    advance.run({ initiativeId: card.id, note }, (data) => {
      setNoteOpen(false);
      if (data.status === 'ADVANCED') setAdvanced(data.toStageName ?? null);
      else setPanelOpen(true);
    });
  };

  const requestToDepartment = (signoff: SignoffView): void => {
    request.run({
      initiativeId: card.id,
      targetDepartment: signoff.department,
      helpType: 'VALIDATION',
      description: isLastStage
        ? `Falta la aprobación de ${DEPARTMENT_LABELS[signoff.department]} para finalizar la iniciativa.`
        : `Falta la aprobación de ${DEPARTMENT_LABELS[signoff.department]} para poder avanzar a ${nextStage?.name ?? 'la siguiente fase'}.`,
      isBlocking: false,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-1">
        <p className="flex-1 text-xs leading-relaxed text-fg-muted">{detail.stage.purpose}</p>
        <InfoHint term="gate" />
      </div>

      <RouteStepper
        initiativeId={card.id}
        route={detail.route}
        session={session}
        disabled={closed}
        personalSteps={personalSteps}
      />

      {detail.finalized ? (
        <p className="tone-success rounded-md px-2.5 py-1.5 text-xs">
          Iniciativa finalizada el {formatDateTime(detail.finalized.at)}
          {detail.finalized.by ? ` por ${detail.finalized.by.name}` : ''}. Su recorrido está en la pestaña Historial.
        </p>
      ) : null}

      <section className="space-y-1.5" aria-labelledby="signoffs-title">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel id="signoffs-title">Aprobaciones obligatorias</SectionLabel>
          <Badge tone={gate.isComplete ? 'success' : 'neutral'} className="tabular-nums">
            {gate.completed}/{gate.total} áreas
          </Badge>
        </div>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {detail.signoffs.map((signoff) => (
            <SignoffRow
              key={signoff.id}
              initiativeId={card.id}
              signoff={signoff}
              session={session}
              disabled={closed}
            />
          ))}
        </ul>
      </section>

      <section className="space-y-1.5" aria-labelledby="custom-checks-title">
        <SectionLabel id="custom-checks-title">Casillas adicionales (no bloquean)</SectionLabel>
        <CustomChecksSection
          initiativeId={card.id}
          checks={detail.customChecks}
          canManage={capabilities.canManageCustomChecks}
          disabled={closed}
        />
        {detail.customChecks.length === 0 && (!capabilities.canManageCustomChecks || closed) ? (
          <p className="text-xs text-fg-subtle">Sin casillas adicionales en esta fase.</p>
        ) : null}
      </section>

      {gate.items.length > 0 ? (
        <details className="group rounded-lg border border-border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-fg-muted hover:text-fg">
            <span className="flex items-center gap-1.5">
              <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
              Guía de la fase (no bloquea)
            </span>
            <span className="tabular-nums text-fg-subtle">
              {guideDone}/{gate.items.length}
            </span>
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {gate.items.map((item) => (
              <li
                key={item.id}
                className={cn('flex items-start gap-2.5 px-3 py-2', item.isCompleted && 'bg-surface-2/40')}
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
                <div className="min-w-0 flex-1 space-y-0.5">
                  <label
                    htmlFor={`gate-${item.id}`}
                    className={cn(
                      'block text-xs leading-snug',
                      item.isCompleted ? 'text-fg-muted line-through' : 'text-fg',
                    )}
                  >
                    {item.label}
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
                    <span>{DEPARTMENT_LABELS[item.responsibleDepartment]}</span>
                    {item.isCompleted && item.completedBy ? (
                      <span>
                        · {item.completedBy.name} · {item.completedAt ? formatDateTime(item.completedAt) : ''}
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <ActionError message={toggle.error} />
        </details>
      ) : null}

      <ActionError message={advance.error} />

      {advanced ? (
        <p className="tone-success rounded-md px-2.5 py-1.5 text-xs">
          Iniciativa avanzada a {advanced}. La propiedad pasa al departamento de la nueva fase.
        </p>
      ) : null}

      {!closed ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            onClick={tryAdvance}
            disabled={advance.isPending || finalize.isPending || !capabilities.canAdvance}
            title={
              capabilities.canAdvance
                ? undefined
                : `Solo ${capabilities.ownerLabel}, propietaria de la fase, puede ${isLastStage ? 'finalizarla' : 'avanzarla'}`
            }
          >
            {gate.isComplete ? (
              isLastStage ? (
                <>
                  <Flag className="size-3.5" />
                  Finalizar iniciativa
                </>
              ) : (
                <>
                  <ArrowRight className="size-3.5" />
                  Avanzar a {nextStage.name}
                  {skippedAhead.length > 0 ? ` (omite ${skippedAhead.join(', ')})` : ''}
                </>
              )
            ) : (
              <>
                <span aria-hidden="true" className="text-xs leading-none">
                  🔒
                </span>
                {isLastStage ? 'Finalizar' : 'Avanzar Fase'} ({gate.total - gate.completed} pendientes)
              </>
            )}
          </Button>
          <span className="text-xs text-fg-subtle">
            {!capabilities.canAdvance
              ? `La ${isLastStage ? 'finaliza' : 'avanza'} ${capabilities.ownerLabel}, que es quien tiene el trabajo en esta fase.`
              : isLastStage
                ? 'Al finalizar, sale del tablero y se guarda en Iniciativas finalizadas.'
                : `Al avanzar, la propiedad pasa a ${DEPARTMENT_LABELS[nextStage.defaultOwnerDepartment]}.`}
          </span>
        </div>
      ) : null}

      {panelOpen && !gate.isComplete && !closed ? (
        <div className="space-y-2.5 rounded-lg border border-border bg-surface-2/50 p-3">
          <div>
            <p className="text-sm font-medium">
              {isLastStage
                ? 'Para finalizar, faltan estas aprobaciones:'
                : `Para pasar a ${nextStage.name}, faltan estas aprobaciones:`}
            </p>
            <p className="mt-0.5 text-xs text-fg-muted">
              {isLastStage ? (
                'Pídeselas al área responsable en un clic. La finalización no admite avance excepcional.'
              ) : (
                <>
                  Pídeselas al área responsable en un clic, o registra un avance excepcional.
                  <InfoHint term="override" className="ml-1 align-middle" />
                </>
              )}
            </p>
          </div>

          <ul className="space-y-1.5">
            {pendingSignoffs.map((signoff) => (
              <li
                key={signoff.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5"
              >
                <span className="text-xs">
                  <span aria-hidden="true" className="text-fg-subtle">
                    ☐
                  </span>{' '}
                  Aprobación de {DEPARTMENT_LABELS[signoff.department]}
                </span>
                {signoff.linkedDependencyId ? (
                  <Badge tone="info">Ya solicitado</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={request.isPending}
                    onClick={() => requestToDepartment(signoff)}
                  >
                    <Send className="size-3" />
                    Solicitar a {DEPARTMENT_LABELS[signoff.department]}
                  </Button>
                )}
              </li>
            ))}
          </ul>

          <ActionError message={request.error} />

          {isLastStage ? null : capabilities.canOverride ? (
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

      {noteOpen ? (
        <StageNoteDialog
          title={isLastStage ? 'Finalizar iniciativa' : `Avanzar a ${nextStage.name}`}
          description={
            isLastStage
              ? `Cierra ${detail.stage.name}: la iniciativa sale del tablero y queda en Iniciativas finalizadas.`
              : `Cierra ${detail.stage.name}. La nota queda en el historial de la iniciativa con tu nombre y la fecha.`
          }
          confirmLabel={isLastStage ? 'Finalizar' : 'Avanzar'}
          pending={advance.isPending || finalize.isPending}
          error={advance.error ?? finalize.error}
          onSubmit={submitNote}
          onClose={() => setNoteOpen(false)}
        />
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
  const pending = detail.signoffs.filter((signoff) => !signoff.isSatisfied);

  const [acknowledged, setAcknowledged] = React.useState<string[]>([]);
  const [note, setNote] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [risk, setRisk] = React.useState('');
  const [signature, setSignature] = React.useState('');

  const allAcknowledged = pending.length > 0 && acknowledged.length === pending.length;
  const signatureOk = signature.trim().toUpperCase() === OVERRIDE_SIGNATURE;
  const canSubmit =
    allAcknowledged &&
    note.trim().length >= MIN_STAGE_ADVANCE_NOTE &&
    reason.trim().length >= MIN_OVERRIDE_REASON &&
    risk.trim().length >= MIN_OVERRIDE_RISK &&
    signatureOk &&
    !advance.isPending;

  const submit = (): void => {
    advance.run(
      {
        initiativeId: detail.card.id,
        note,
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
            <SectionLabel>Aprobaciones que quedan pendientes</SectionLabel>
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
                    Aprobación de {DEPARTMENT_LABELS[item.department]}
                  </label>
                </li>
              ))}
            </ul>
            {!allAcknowledged ? (
              <p className="text-xs text-fg-subtle">
                Debes reconocer todas las aprobaciones pendientes antes de firmar.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="override-note">Nota de avance</Label>
            <Textarea
              id="override-note"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Qué se ha hecho en esta fase y qué queda abierto"
            />
            <p className="text-xs tabular-nums text-fg-subtle">
              {note.trim().length}/{MIN_STAGE_ADVANCE_NOTE} caracteres mínimos
            </p>
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
