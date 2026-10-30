'use client';

import * as React from 'react';
import { Check, Copy, KeyRound, Trash2 } from 'lucide-react';
import { createApiTokenAction, revokeApiTokenAction } from '@/server/actions/api-tokens';
import { ActionError, useAction } from '@/lib/use-action';
import { toast } from '@/lib/toast';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, Input, Label, Select } from '@/components/ui/primitives';

export interface ApiTokenRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  /** Calculado en el servidor: activo, revocado o caducado. */
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
}

const STATUS_LABEL = { ACTIVE: 'Activo', REVOKED: 'Revocado', EXPIRED: 'Caducado' } as const;

/** Tokens personales para conectar un cliente de IA (MCP) con tus mismos permisos. */
export function ApiTokensCard({ tokens, maxDays }: { tokens: ApiTokenRow[]; maxDays: number }) {
  const create = useAction(createApiTokenAction, { success: 'Token creado' });
  const revoke = useAction(revokeApiTokenAction, { success: 'Token revocado' });
  const [name, setName] = React.useState('');
  const [days, setDays] = React.useState(30);
  const [created, setCreated] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const command = created
    ? `claude mcp add --transport http temotiva-flow ${origin}/api/mcp --header "Authorization: Bearer ${created}"`
    : '';

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast('Copiado');
    } catch {
      toast('No se pudo copiar: selecciónalo a mano', 'danger');
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="token-name">Nombre</Label>
          <Input
            id="token-name"
            value={name}
            placeholder="p. ej. Claude en mi portátil"
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="token-days">Caduca en</Label>
          <Select id="token-days" value={days} onChange={(event) => setDays(Number(event.target.value))}>
            {[7, 30, maxDays].map((option) => (
              <option key={option} value={option}>
                {option} días
              </option>
            ))}
          </Select>
        </div>
        <Button
          size="sm"
          disabled={name.trim().length < 3 || create.isPending}
          onClick={() =>
            create.run({ name, days }, (data) => {
              setCreated(data.token);
              setCopied(false);
              setName('');
            })
          }
        >
          <KeyRound className="size-3.5" />
          {create.isPending ? 'Creando…' : 'Crear token'}
        </Button>
      </div>
      <ActionError message={create.error} />

      {created ? (
        <div className="tone-warning space-y-2 rounded-md px-3 py-2.5 text-xs">
          <p className="font-medium">Copia el token ahora: no volverá a mostrarse.</p>
          <p className="break-all font-mono">{created}</p>
          <p className="text-fg-muted">Para conectar Claude Code, ejecuta:</p>
          <p className="break-all rounded bg-surface px-2 py-1.5 font-mono text-fg">{command}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => copy(created)}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              Copiar token
            </Button>
            <Button size="sm" variant="outline" onClick={() => copy(command)}>
              <Copy className="size-3.5" />
              Copiar comando
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
              Ya lo guardé
            </Button>
          </div>
        </div>
      ) : null}

      {tokens.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {tokens.map((token) => (
            <li key={token.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg">{token.name}</p>
                <p className="text-xs text-fg-subtle">
                  <span className="font-mono">{token.prefix}…</span> · creado {formatDate(token.createdAt)} ·{' '}
                  {token.status === 'REVOKED' ? 'revocado' : `caduca ${formatDate(token.expiresAt)}`} ·{' '}
                  {token.lastUsedAt ? `último uso ${formatDate(token.lastUsedAt)}` : 'sin usar'}
                </p>
              </div>
              <Badge tone={token.status === 'ACTIVE' ? 'success' : 'neutral'}>{STATUS_LABEL[token.status]}</Badge>
              {token.status === 'ACTIVE' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={revoke.isPending}
                  onClick={() => revoke.run({ tokenId: token.id })}
                >
                  <Trash2 className="size-3.5" />
                  Revocar
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-fg-subtle">Aún no has creado ningún token.</p>
      )}
      <ActionError message={revoke.error} />
    </div>
  );
}
