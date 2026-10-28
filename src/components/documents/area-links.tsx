'use client';

import * as React from 'react';
import { ExternalLink, Link2, Plus, Trash2 } from 'lucide-react';
import { DEPARTMENTS } from '@/domain/enums';
import type { Department } from '@/domain/enums';
import { DEPARTMENT_LABELS, departmentsLabel } from '@/domain/labels';
import { MAX_LINK_TITLE } from '@/domain/rules';
import { addAreaLinkAction, removeAreaLinkAction } from '@/server/actions/area-links';
import type { AreaLinkView } from '@/server/services/area-links';
import { ActionError, useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, Input, Label, SectionLabel, Select } from '@/components/ui/primitives';
import { formatDate } from '@/lib/utils';

/** Enlaces a Google Docs/Drive por área: título + URL. El servidor revalida el host y el protocolo. */
export function AreaLinks({
  links,
  addDepartments,
  myDepartments,
}: {
  links: AreaLinkView[];
  /** Áreas a las que esta persona puede añadir (Dirección, todas). */
  addDepartments: Department[];
  myDepartments: Department[];
}) {
  const [query, setQuery] = React.useState('');
  const [area, setArea] = React.useState<'ALL' | Department>('ALL');

  const needle = query.trim().toLowerCase();
  const visible = links.filter(
    (link) => (area === 'ALL' || link.department === area) && (!needle || link.title.toLowerCase().includes(needle)),
  );
  const areasPresent = DEPARTMENTS.filter((department) => links.some((link) => link.department === department));

  return (
    <>
      <AddLinkCard addDepartments={addDepartments} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SectionLabel className="mr-auto">Enlaces ({visible.length})</SectionLabel>
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por título…"
            aria-label="Buscar enlaces"
            className="w-full sm:w-52"
          />
          {areasPresent.length > 1 ? (
            <div className="w-full sm:w-48">
              <Select value={area} onChange={(event) => setArea(event.target.value as 'ALL' | Department)} aria-label="Filtrar enlaces por área">
                <option value="ALL">Todas las áreas</option>
                {areasPresent.map((department) => (
                  <option key={department} value={department}>
                    {DEPARTMENT_LABELS[department]}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            title={links.length === 0 ? 'Aún no hay enlaces' : 'Nada coincide con tu búsqueda'}
            description={
              links.length === 0
                ? `Añade el primero arriba. Verás los de tu área (${departmentsLabel(myDepartments)}).`
                : 'Prueba con otro título o cambia el área.'
            }
          />
        ) : (
          <ul className="space-y-2">
            {visible.map((link) => (
              <LinkRow key={link.id} link={link} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function AddLinkCard({ addDepartments }: { addDepartments: Department[] }) {
  const add = useAction(addAreaLinkAction, { success: 'Enlace añadido' });
  const [department, setDepartment] = React.useState<Department>(addDepartments[0] ?? 'PRODUCT');
  const [title, setTitle] = React.useState('');
  const [url, setUrl] = React.useState('');

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    add.run({ title, url, department }, () => {
      setTitle('');
      setUrl('');
    });
  };

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="link-area">Área</Label>
            <Select id="link-area" value={department} onChange={(event) => setDepartment(event.target.value as Department)} disabled={add.isPending}>
              {addDepartments.map((item) => (
                <option key={item} value={item}>
                  {DEPARTMENT_LABELS[item]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="link-title">Título</Label>
            <Input
              id="link-title"
              value={title}
              maxLength={MAX_LINK_TITLE}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Política de acceso 2026"
              disabled={add.isPending}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="link-url">Enlace del documento</Label>
          <Input
            id="link-url"
            type="url"
            inputMode="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://docs.google.com/document/d/…"
            disabled={add.isPending}
          />
          <p className="text-xs text-fg-subtle">Solo enlaces de Google Docs, Sheets, Slides o Drive. Revisa que el área tenga permiso de lectura en Google.</p>
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={add.isPending || title.trim().length < 3 || url.trim() === ''}>
            <Plus aria-hidden /> Añadir enlace
          </Button>
        </div>
        <ActionError message={add.error} />
      </form>
    </Card>
  );
}

function LinkRow({ link }: { link: AreaLinkView }) {
  const remove = useAction(removeAreaLinkAction, { success: 'Enlace retirado' });

  return (
    <li>
      <Card className="flex flex-wrap items-start gap-3 p-3">
        <Link2 aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
        <div className="min-w-0 flex-1 space-y-1">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-fg [overflow-wrap:anywhere] hover:text-accent hover:underline"
          >
            {link.title}
          </a>
          <p className="text-xs text-fg-subtle">
            {link.createdByName} · {formatDate(link.createdAt)}
          </p>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <Badge tone={link.isOwnArea ? 'accent' : 'info'}>{DEPARTMENT_LABELS[link.department]}</Badge>
          </div>
          <ActionError message={remove.error} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            aria-label={`Abrir ${link.title}`}
            title="Abrir en una pestaña nueva"
          >
            <ExternalLink className="size-3.5" />
          </a>
          {link.canRemove ? (
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.run({ linkId: link.id })}
              className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-[var(--danger)] disabled:opacity-50"
              aria-label={`Retirar ${link.title}`}
              title="Retirar"
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : null}
        </div>
      </Card>
    </li>
  );
}
