'use client';

import * as React from 'react';
import { CheckCircle2, HandHelping, XCircle } from 'lucide-react';
import type { Department, HelpType } from '@/domain/enums';
import { DEPARTMENTS, HELP_TYPES_V1 } from '@/domain/enums';
import { DEPARTMENT_LABELS, HELP_STATUS_LABELS, HELP_TYPE_HINTS, HELP_TYPE_LABELS } from '@/domain/labels';
import { MIN_DEPENDENCY_DESCRIPTION, MIN_RESOLUTION_NOTES } from '@/domain/rules';
import type { SessionContext } from '@/domain/types';
import type { DependencyView, InitiativeDetailView } from '@/server/services/views';
import {
  createDependencyAction,
  rejectDependencyAction,
  resolveDependencyAction,
} from '@/server/actions/collaboration';
import { ActionError, useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Badge, Label, Select, Separator, Textarea } from '@/components/ui/primitives';
import { HelpTypeBadge } from '@/components/shared/signals';
import { formatDateTime } from '@/lib/utils';

/**
 * Pestaña Dependencias (🆘). Abrir una solicitud no cambia el propietario;
 * marcarla como bloqueante sí para el reloj y enciende la franja de parada.
 */
export function DependenciesTab({
  detail,
  session,
}: {
  detail: InitiativeDetailView;
  session: SessionContext;
}) {
  const create = useAction(createDependencyAction);
  const [open, setOpen] = React.useState(detail.dependencies.length === 0);
  const [targetDepartment, setTargetDepartment] = React.useState<Department>('LEGAL');
  const [helpType, setHelpType] = React.useState<HelpType>('VALIDATION');
  const [description, setDescription] = React.useState('');
  const [isBlocking, setIsBlocking] = React.useState(false);

  const submit = (): void => {
    create.run(
      {
        initiativeId: detail.card.id,
        targetDepartment,
        helpType,
        description,
        isBlocking,
      },
      () => {
        setDescription('');
        setIsBlocking(false);
        setOpen(false);
      },
    );
  };

  return (
    <div className="space-y-5">
      {open ? (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dependency-department">Departamento destino</Label>
              <Select
                id="dependency-department"
                value={targetDepartment}
                onChange={(event) => setTargetDepartment(event.target.value as Department)}
              >
                {DEPARTMENTS.map((department) => (
                  <option key={department} value={department}>
                    {DEPARTMENT_LABELS[department]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dependency-type">Tipo de necesidad</Label>
              <Select
                id="dependency-type"
                value={helpType}
                onChange={(event) => setHelpType(event.target.value as HelpType)}
              >
                {HELP_TYPES_V1.map((type) => (
                  <option key={type} value={type}>
                    {HELP_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
              <p className="text-[11px] text-muted-foreground">{HELP_TYPE_HINTS[helpType]}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dependency-description">Descripción de la petición</Label>
            <Textarea
              id="dependency-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={`Qué necesitas exactamente (mínimo ${MIN_DEPENDENCY_DESCRIPTION} caracteres)`}
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
            <div>
              <Label htmlFor="dependency-blocking" className="text-foreground">
                ¿Bloquea totalmente el trabajo?
              </Label>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Si lo bloquea, la iniciativa entra en parada y su reloj de SLE se detiene hasta resolverla.
              </p>
            </div>
            <Switch id="dependency-blocking" checked={isBlocking} onCheckedChange={setIsBlocking} />
          </div>

          <ActionError message={create.error} />

          <div className="flex gap-2">
            <Button size="sm" onClick={submit} disabled={create.isPending || detail.card.isArchived}>
              <HandHelping className="size-4" />
              {create.isPending ? 'Enviando…' : 'Solicitar ayuda'}
            </Button>
            {detail.dependencies.length > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={detail.card.isArchived}>
          <HandHelping className="size-4" />
          Solicitar ayuda a un departamento
        </Button>
      )}

      <Separator />

      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Historial de solicitudes
        </h4>
        {detail.dependencies.length === 0 ? (
          <p className="text-xs text-muted-foreground">Esta iniciativa no ha pedido ayuda a nadie todavía.</p>
        ) : (
          <ul className="space-y-2.5">
            {detail.dependencies.map((dependency) => (
              <DependencyRow key={dependency.id} dependency={dependency} session={session} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DependencyRow({ dependency, session }: { dependency: DependencyView; session: SessionContext }) {
  const resolve = useAction(resolveDependencyAction);
  const reject = useAction(rejectDependencyAction);
  const [notes, setNotes] = React.useState('');

  const canClose =
    dependency.status === 'PENDING' &&
    (session.role === 'EXECUTIVE' ||
      session.department === dependency.targetDepartment ||
      session.userId === dependency.requestedBy?.id);

  return (
    <li className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{DEPARTMENT_LABELS[dependency.targetDepartment]}</Badge>
        <HelpTypeBadge helpType={dependency.helpType} isBlocking={dependency.isBlocking} />
        <Badge
          tone={
            dependency.status === 'PENDING' ? 'warning' : dependency.status === 'RESOLVED' ? 'success' : 'neutral'
          }
        >
          {HELP_STATUS_LABELS[dependency.status]}
        </Badge>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {dependency.requestedBy?.name ?? '—'} · {formatDateTime(dependency.createdAt)}
        </span>
      </div>

      <p className="text-xs leading-relaxed">{dependency.description}</p>

      {dependency.status !== 'PENDING' ? (
        <div className="rounded-md bg-muted px-3 py-2 text-[11px]">
          <p className="font-medium">
            {dependency.resolvedBy?.name ?? '—'}
            {dependency.resolvedAt ? ` · ${formatDateTime(dependency.resolvedAt)}` : ''}
          </p>
          <p className="mt-0.5 text-muted-foreground">{dependency.resolutionNotes}</p>
        </div>
      ) : canClose ? (
        <div className="space-y-2">
          <Textarea
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={`Respuesta del departamento (mínimo ${MIN_RESOLUTION_NOTES} caracteres)`}
          />
          <ActionError message={resolve.error ?? reject.error} />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={resolve.isPending}
              onClick={() => resolve.run({ dependencyId: dependency.id, resolutionNotes: notes })}
            >
              <CheckCircle2 className="size-3.5" />
              Resolver y cerrar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={reject.isPending}
              onClick={() => reject.run({ dependencyId: dependency.id, resolutionNotes: notes })}
            >
              <XCircle className="size-3.5" />
              Rechazar
            </Button>
          </div>
          {dependency.isBlocking ? (
            <p className="text-[11px] text-muted-foreground">
              Al cerrar la última solicitud bloqueante, la parada se levanta automáticamente.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Pendiente de respuesta de {DEPARTMENT_LABELS[dependency.targetDepartment]}.
        </p>
      )}
    </li>
  );
}
