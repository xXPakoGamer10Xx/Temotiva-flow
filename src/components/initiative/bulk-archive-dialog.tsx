'use client';

import * as React from 'react';
import { Archive, Search } from 'lucide-react';
import { MIN_ARCHIVE_REASON } from '@/domain/rules';
import { archiveInitiativesAction } from '@/server/actions/initiatives';
import { ActionError, useAction } from '@/lib/use-action';
import { toast } from '@/lib/toast';
import { UI_EVENTS, openBulkArchive, useUiEvent } from '@/components/command/command-bus';
import type { PaletteInitiative } from '@/components/command/command-center';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/primitives';

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function BulkArchiveButton() {
  return (
    <Button size="sm" variant="outline" onClick={openBulkArchive}>
      <Archive className="size-3.5" />
      Archivar en bloque
    </Button>
  );
}

/**
 * Archivado en bloque (solo Dirección): limpia de una vez las iniciativas de
 * prueba. Es borrado lógico; cada iniciativa deja su evento en la caja negra y
 * se puede restaurar desde su ficha con el filtro "Archivadas".
 */
export function BulkArchiveDialog({ initiatives }: { initiatives: PaletteInitiative[] }) {
  const archive = useAction(archiveInitiativesAction);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [reason, setReason] = React.useState('');

  useUiEvent(UI_EVENTS.bulkArchive, () => setOpen(true));

  const visible = React.useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return initiatives;
    return initiatives.filter((initiative) =>
      normalize(`${initiative.id} ${initiative.title} ${initiative.stageName}`).includes(needle),
    );
  }, [initiatives, query]);

  const toggle = (id: string): void =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allVisibleSelected = visible.length > 0 && visible.every((initiative) => selected.has(initiative.id));
  const toggleVisible = (): void =>
    setSelected((current) => {
      const next = new Set(current);
      for (const initiative of visible) {
        if (allVisibleSelected) next.delete(initiative.id);
        else next.add(initiative.id);
      }
      return next;
    });

  const close = (): void => {
    setOpen(false);
    setSelected(new Set());
    setQuery('');
    setReason('');
  };

  const canSubmit = selected.size > 0 && reason.trim().length >= MIN_ARCHIVE_REASON && !archive.isPending;

  const submit = (): void => {
    archive.run({ initiativeIds: [...selected], reason }, (data) => {
      toast(
        data.skipped.length > 0
          ? `${data.archived.length} archivadas · ${data.skipped.length} sin archivar`
          : `${data.archived.length} iniciativas archivadas`,
      );
      close();
    });
  };

  if (!open) return null;

  return (
    <Dialog open onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent className="w-[min(38rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>Archivar iniciativas en bloque</DialogTitle>
          <p className="mt-1 text-xs text-fg-muted">
            Desaparecen del tablero pero no se borran: siguen en la caja negra y se pueden restaurar con el filtro
            “Archivadas”.
          </p>
        </DialogHeader>

        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) submit();
          }}
        >
          <DialogBody className="space-y-3.5">
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por ID, título o fase"
                className="pl-8"
                autoFocus
              />
            </div>

            <div className="rounded-md border border-border">
              <label className="flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 text-xs text-fg-muted">
                <Checkbox checked={allVisibleSelected} onCheckedChange={toggleVisible} />
                Seleccionar {visible.length === initiatives.length ? 'todas' : 'las visibles'} ({visible.length})
              </label>
              <ul className="scrollbar-slim max-h-64 overflow-y-auto">
                {visible.map((initiative) => (
                  <li key={initiative.id}>
                    <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 hover:bg-surface-2">
                      <Checkbox
                        className="mt-0.5"
                        checked={selected.has(initiative.id)}
                        onCheckedChange={() => toggle(initiative.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-fg [overflow-wrap:anywhere]">{initiative.title}</span>
                        <span className="text-xs text-fg-subtle">
                          <span className="font-mono">{initiative.id}</span> · {initiative.stageName}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
                {visible.length === 0 ? (
                  <li className="px-3 py-4 text-center text-xs text-fg-muted">Ninguna iniciativa coincide.</li>
                ) : null}
              </ul>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bulk-archive-reason">Motivo</Label>
              <Textarea
                id="bulk-archive-reason"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Limpieza de iniciativas de prueba tras el piloto"
              />
            </div>

            <ActionError message={archive.error} />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              <Archive className="size-3.5" />
              Archivar {selected.size > 0 ? `${selected.size} ` : ''}
              {selected.size === 1 ? 'iniciativa' : 'iniciativas'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
