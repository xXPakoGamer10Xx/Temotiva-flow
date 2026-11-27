'use client';

import * as React from 'react';
import { MAX_STAGE_ADVANCE_NOTE, MIN_STAGE_ADVANCE_NOTE } from '@/domain/rules';
import { ActionError } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Label, Textarea } from '@/components/ui/primitives';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Nota de avance obligatoria (spec 005 §5.5): qué se hizo o cerró en la fase.
 * La usan el botón de avance, la finalización y el arrastre del tablero; el
 * servidor vuelve a validar la longitud.
 */
export function StageNoteDialog({
  title,
  description,
  confirmLabel,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = React.useState('');
  const length = note.trim().length;
  const valid = length >= MIN_STAGE_ADVANCE_NOTE && length <= MAX_STAGE_ADVANCE_NOTE;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="w-[min(34rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">{description}</p>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !pending) onSubmit(note.trim());
          }}
        >
          <DialogBody className="space-y-1.5">
            <Label htmlFor="stage-note">Nota de avance</Label>
            <Textarea
              id="stage-note"
              rows={5}
              autoFocus
              value={note}
              maxLength={MAX_STAGE_ADVANCE_NOTE}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Qué se ha hecho o cerrado en esta fase, decisiones tomadas y lo que debe saber el área siguiente"
            />
            <p className="text-xs tabular-nums text-fg-subtle">
              {length < MIN_STAGE_ADVANCE_NOTE
                ? `${length}/${MIN_STAGE_ADVANCE_NOTE} caracteres mínimos`
                : `${length}/${MAX_STAGE_ADVANCE_NOTE}`}
            </p>
            <ActionError message={error} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || pending}>
              {pending ? 'Registrando…' : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
