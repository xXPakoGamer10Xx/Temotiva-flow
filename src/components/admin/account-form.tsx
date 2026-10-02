'use client';

import * as React from 'react';
import { Check, Save } from 'lucide-react';
import { updateOwnProfileAction } from '@/server/actions/administration';
import { ActionError, useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/primitives';

/** Lo único del perfil que cada persona cambia por su cuenta: su nombre visible. */
export function AccountForm({ name: initialName, email }: { name: string; email: string }) {
  const update = useAction(updateOwnProfileAction);
  const [name, setName] = React.useState(initialName);
  const [saved, setSaved] = React.useState(false);

  const isDirty = name.trim() !== initialName;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="account-name">Nombre visible</Label>
        <Input
          id="account-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setSaved(false);
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="account-email">Correo de acceso</Label>
        <Input id="account-email" value={email} disabled readOnly className="font-mono" />
      </div>

      <ActionError message={update.error} />

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={!isDirty || name.trim().length < 3 || update.isPending}
          onClick={() => update.run({ name }, () => setSaved(true))}
        >
          <Save className="size-3.5" />
          {update.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
        {saved && !isDirty ? (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--success)]">
            <Check className="size-3" />
            Guardado
          </span>
        ) : null}
      </div>
    </div>
  );
}
