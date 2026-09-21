'use client';

import * as React from 'react';
import { OctagonX, PlayCircle } from 'lucide-react';
import type { StopReason } from '@/domain/enums';
import { STOP_REASONS } from '@/domain/enums';
import { STOP_REASON_LABELS } from '@/domain/labels';
import { MIN_BLOCK_DESCRIPTION } from '@/domain/rules';
import { clearBlockedAction, setBlockedAction } from '@/server/actions/collaboration';
import { ActionError, useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Label, Select, Textarea } from '@/components/ui/primitives';

/** Activa o desactiva el estado de parada. Cualquier rol puede hacerlo. */
export function BlockControl({
  initiativeId,
  isBlocked,
  stopReason,
  disabled = false,
}: {
  initiativeId: string;
  isBlocked: boolean;
  stopReason: StopReason | null;
  disabled?: boolean;
}) {
  const block = useAction(setBlockedAction);
  const clear = useAction(clearBlockedAction);
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<StopReason>(stopReason ?? 'ESPERANDO_DECISION');
  const [description, setDescription] = React.useState('');

  if (isBlocked) {
    return (
      <div className="space-y-1">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || clear.isPending}
          onClick={() => clear.run({ initiativeId })}
        >
          <PlayCircle className="size-4" />
          Levantar parada
        </Button>
        <ActionError message={clear.error} />
      </div>
    );
  }

  if (!open) {
    return (
      <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setOpen(true)}>
        <OctagonX className="size-4" />
        Declarar parada
      </Button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-md border border-border p-3 sm:w-96">
      <div className="space-y-1.5">
        <Label htmlFor="stop-reason">Causa raíz de la parada</Label>
        <Select
          id="stop-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value as StopReason)}
        >
          {STOP_REASONS.map((value) => (
            <option key={value} value={value}>
              {STOP_REASON_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>

      <Textarea
        rows={2}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder={`Qué impide continuar (mínimo ${MIN_BLOCK_DESCRIPTION} caracteres)`}
      />

      <ActionError message={block.error} />

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="danger"
          disabled={block.isPending}
          onClick={() =>
            block.run({ initiativeId, stopReason: reason, description }, () => {
              setOpen(false);
              setDescription('');
            })
          }
        >
          Declarar parada
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Mientras la iniciativa esté en parada, su reloj de SLE se detiene.
      </p>
    </div>
  );
}
