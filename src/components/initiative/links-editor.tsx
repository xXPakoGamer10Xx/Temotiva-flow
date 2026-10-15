'use client';

import { Plus, X } from 'lucide-react';
import { LINK_KINDS } from '@/domain/enums';
import { LINK_KIND_LABELS } from '@/domain/labels';
import type { InitiativeLink } from '@/domain/types';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/primitives';

export const MAX_LINKS = 10;

/** Drops rows the person left empty so they never reach the server. */
export function cleanLinks(links: InitiativeLink[]): InitiativeLink[] {
  return links
    .map((link) => ({ ...link, label: link.label.trim(), url: link.url.trim() }))
    .filter((link) => link.label !== '' || link.url !== '');
}

/** True when every non-empty row has a label and an http(s) URL. */
export function linksAreValid(links: InitiativeLink[]): boolean {
  return cleanLinks(links).every((link) => {
    if (link.label.length < 2) return false;
    try {
      const url = new URL(link.url);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  });
}

export function sameLinks(a: InitiativeLink[], b: InitiativeLink[]): boolean {
  const left = cleanLinks(a);
  const right = cleanLinks(b);
  return (
    left.length === right.length &&
    left.every((link, i) => {
      const other = right[i];
      return other !== undefined && link.kind === other.kind && link.label === other.label && link.url === other.url;
    })
  );
}

/**
 * Editor de enlaces (Figma, Notion, repositorio…). Controlado: el padre guarda
 * la lista y decide cuándo enviarla; el servidor vuelve a validar todo.
 */
export function LinksEditor({
  value,
  onChange,
  disabled,
}: {
  value: InitiativeLink[];
  onChange: (next: InitiativeLink[]) => void;
  disabled?: boolean;
}) {
  const patch = (index: number, change: Partial<InitiativeLink>): void =>
    onChange(value.map((link, i) => (i === index ? { ...link, ...change } : link)));

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <p className="text-xs text-fg-muted">Sin enlaces de Figma, Notion o repositorio.</p>
      ) : (
        <ul className="space-y-2">
          {value.map((link, index) => (
            <li key={index} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-1.5 sm:grid-cols-[6.5rem_9rem_1fr_auto]">
              <Select
                aria-label="Tipo de enlace"
                value={link.kind}
                disabled={disabled}
                onChange={(event) => patch(index, { kind: event.target.value as InitiativeLink['kind'] })}
              >
                {LINK_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {LINK_KIND_LABELS[kind]}
                  </option>
                ))}
              </Select>
              <Input
                aria-label="Nombre del enlace"
                value={link.label}
                maxLength={60}
                disabled={disabled}
                placeholder="Nombre"
                className="col-span-2 sm:col-span-1"
                onChange={(event) => patch(index, { label: event.target.value })}
              />
              <Input
                aria-label="Dirección del enlace"
                type="url"
                value={link.url}
                disabled={disabled}
                placeholder="https://…"
                className="col-span-2 col-start-1 row-start-2 sm:col-span-1 sm:col-start-auto sm:row-start-auto"
                onChange={(event) => patch(index, { url: event.target.value })}
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                className="text-fg-subtle hover:text-fg disabled:opacity-50"
                aria-label="Quitar enlace"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.length < MAX_LINKS ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange([...value, { kind: 'FIGMA', label: '', url: '' }])}
        >
          <Plus className="size-3.5" />
          Añadir enlace
        </Button>
      ) : (
        <p className="text-xs text-fg-subtle">Máximo {MAX_LINKS} enlaces.</p>
      )}
      {!linksAreValid(value) ? (
        <p className="text-xs text-fg-subtle">Cada enlace necesita un nombre y una dirección que empiece por https://.</p>
      ) : null}
    </div>
  );
}
