'use client';

import * as React from 'react';
import { Save } from 'lucide-react';
import type { WorkflowStage } from '@/domain/types';
import { DEPARTMENT_LABELS } from '@/domain/labels';
import { updateStageSettingsAction } from '@/server/actions/administration';
import { ActionError, useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/primitives';

/** Ajuste de objetivos de SLE y límites de WIP. Capacidad exclusiva de Dirección. */
export function StageSettings({ stages }: { stages: WorkflowStage[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-fg-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Fase</th>
            <th scope="col" className="px-3 py-2 font-medium">Propietario por defecto</th>
            <th scope="col" className="px-3 py-2 font-medium">SLE (horas)</th>
            <th scope="col" className="px-3 py-2 font-medium">Límite WIP</th>
            <th scope="col" className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {stages.map((stage) => (
            <StageRow key={stage.id} stage={stage} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StageRow({ stage }: { stage: WorkflowStage }) {
  const update = useAction(updateStageSettingsAction, { success: 'Parámetros de la fase guardados' });
  const [sleHours, setSleHours] = React.useState(String(stage.sleHours));
  const [wipLimit, setWipLimit] = React.useState(String(stage.wipLimit));

  const isDirty = Number(sleHours) !== stage.sleHours || Number(wipLimit) !== stage.wipLimit;

  return (
    <tr>
      <th scope="row" className="px-3 py-2.5 text-left font-medium">
        {stage.name}
      </th>
      <td className="px-3 py-2.5 text-fg-muted">{DEPARTMENT_LABELS[stage.defaultOwnerDepartment]}</td>
      <td className="px-3 py-2.5">
        <Input
          type="number"
          min={1}
          value={sleHours}
          aria-label={`Objetivo de SLE de ${stage.name} en horas`}
          onChange={(event) => setSleHours(event.target.value)}
          className="h-8 w-24 text-xs"
        />
      </td>
      <td className="px-3 py-2.5">
        <Input
          type="number"
          min={1}
          value={wipLimit}
          aria-label={`Límite de WIP de ${stage.name}`}
          onChange={(event) => setWipLimit(event.target.value)}
          className="h-8 w-20 text-xs"
        />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!isDirty || update.isPending}
            onClick={() =>
              update.run({ stageId: stage.id, sleHours: Number(sleHours), wipLimit: Number(wipLimit) })
            }
          >
            <Save className="size-3.5" />
            Guardar
          </Button>
          <ActionError message={update.error} />
        </div>
      </td>
    </tr>
  );
}
