'use client';

import * as React from 'react';
import { MoreHorizontal, ShieldCheck, ShieldOff, UserMinus, UserPlus } from 'lucide-react';
import type { Department, UserRole } from '@/domain/enums';
import { DEPARTMENTS } from '@/domain/enums';
import { DEPARTMENT_LABELS, DEPARTMENT_SHORT, USER_ROLE_LABELS } from '@/domain/labels';
import {
  anonymizeUserAction,
  grantAccessAction,
  setAccessActiveAction,
  updateAccessAction,
} from '@/server/actions/administration';
import { ActionError, useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Checkbox, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/controls';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, Badge, Input, Label, SectionLabel, Select, Textarea } from '@/components/ui/primitives';
import { DepartmentDot } from '@/components/shared/signals';
import { cn } from '@/lib/utils';

export interface AccessRow {
  id: string;
  name: string;
  email: string;
  departments: Department[];
  role: UserRole;
  isActive: boolean;
  isAnonymized: boolean;
  /** Lo calcula el servidor con la matriz de permisos; aquí solo se pinta. */
  canManage: boolean;
}

export interface AccessScope {
  /** `null` = Dirección, que alcanza a toda la organización. */
  departments: Department[] | null;
  assignableRoles: UserRole[];
  canAnonymize: boolean;
  currentUserId: string;
}

/**
 * Gestión de personas con jerarquía descendente (DESIGN.md §8.3).
 *
 * Dirección da de alta a cualquiera y asigna las áreas; cada responsable suma
 * miembros dentro de las áreas que lleva; quien es miembro no ve esta pantalla.
 * Todo lo que se puede pulsar aquí se vuelve a comprobar en el servidor.
 */
export function AccessManager({ rows, scope }: { rows: AccessRow[]; scope: AccessScope }) {
  const [dialog, setDialog] = React.useState<{ mode: 'create' } | { mode: 'edit'; row: AccessRow } | null>(null);
  const [anonymizing, setAnonymizing] = React.useState<AccessRow | null>(null);
  const toggle = useAction(setAccessActiveAction);

  const available = scope.departments ?? [...DEPARTMENTS];
  const active = rows.filter((row) => row.isActive);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-muted">
          {active.length} con acceso activo de {rows.length}
          {scope.departments ? ` · tu alcance: ${scope.departments.map((d) => DEPARTMENT_SHORT[d]).join(' · ')}` : ''}
        </p>
        <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
          <UserPlus className="size-3.5" />
          Añadir persona
        </Button>
      </div>

      <ActionError message={toggle.error} />

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-2/70 text-[11px] text-fg-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Persona</th>
              <th scope="col" className="px-3 py-2 font-medium">Áreas</th>
              <th scope="col" className="px-3 py-2 font-medium">Rol</th>
              <th scope="col" className="px-3 py-2 font-medium">Acceso</th>
              <th scope="col" className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className={cn('align-middle', !row.isActive && 'opacity-55')}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={row.name} className="size-6" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-fg">{row.name}</p>
                      <p className="truncate text-[11px] text-fg-subtle">{row.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {row.departments.map((department) => (
                      <Badge key={department} tone="neutral">
                        <DepartmentDot department={department} />
                        {DEPARTMENT_SHORT[department]}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={row.role === 'EXECUTIVE' ? 'accent' : row.role === 'LEAD' ? 'info' : 'neutral'}>
                    {USER_ROLE_LABELS[row.role]}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  {row.isAnonymized ? (
                    <Badge tone="neutral">Anonimizada</Badge>
                  ) : (
                    <Badge tone={row.isActive ? 'success' : 'neutral'}>{row.isActive ? 'Activo' : 'De baja'}</Badge>
                  )}
                  {row.id === scope.currentUserId ? (
                    <span className="ml-1.5 text-[11px] text-fg-subtle">(tú)</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right">
                  {row.canManage && !row.isAnonymized ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                        aria-label={`Acciones sobre ${row.name}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => setDialog({ mode: 'edit', row })}>
                          Editar nombre, áreas y rol
                        </DropdownMenuItem>
                        {row.id === scope.currentUserId ? null : (
                          <DropdownMenuItem
                            onSelect={() => toggle.run({ userId: row.id, isActive: !row.isActive })}
                          >
                            {row.isActive ? (
                              <>
                                <ShieldOff className="size-3.5" />
                                Revocar el acceso
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="size-3.5" />
                                Reactivar el acceso
                              </>
                            )}
                          </DropdownMenuItem>
                        )}
                        {scope.canAnonymize && !row.isActive && row.id !== scope.currentUserId ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-[var(--danger)]"
                              onSelect={() => setAnonymizing(row)}
                            >
                              <UserMinus className="size-3.5" />
                              Anonimizar (RGPD)
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="text-[11px] text-fg-subtle">Fuera de tu alcance</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog ? (
        <PersonDialog
          key={dialog.mode === 'edit' ? dialog.row.id : 'create'}
          row={dialog.mode === 'edit' ? dialog.row : null}
          available={available}
          assignableRoles={scope.assignableRoles}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {anonymizing ? (
        <AnonymizeDialog row={anonymizing} onClose={() => setAnonymizing(null)} />
      ) : null}
    </div>
  );
}

/** Alta y edición comparten formulario: los mismos campos, el mismo alcance. */
function PersonDialog({
  row,
  available,
  assignableRoles,
  onClose,
}: {
  row: AccessRow | null;
  available: Department[];
  assignableRoles: UserRole[];
  onClose: () => void;
}) {
  const grant = useAction(grantAccessAction);
  const update = useAction(updateAccessAction);
  const isEdit = row !== null;

  const [name, setName] = React.useState(row?.name ?? '');
  const [email, setEmail] = React.useState(row?.email ?? '');
  const [departments, setDepartments] = React.useState<Department[]>(row?.departments ?? []);
  const [role, setRole] = React.useState<UserRole>(row?.role ?? assignableRoles[0] ?? 'MEMBER');

  const canSubmit =
    name.trim().length >= 3 && departments.length > 0 && (isEdit || email.trim().length > 3) && !grant.isPending && !update.isPending;

  const submit = (): void => {
    if (isEdit) {
      update.run({ userId: row.id, name, departments, role }, onClose);
    } else {
      grant.run({ name, email, departments, role }, onClose);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="w-[min(32rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar persona' : 'Añadir persona'}</DialogTitle>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            {isEdit
              ? 'El correo no se cambia aquí: es la llave con la que entra en el sistema.'
              : 'Debe ser el correo exacto de la cuenta de Google con la que iniciará sesión.'}
          </p>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="person-name">Nombre</Label>
            <Input id="person-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="person-email">Correo de Google</Label>
            <Input
              id="person-email"
              type="email"
              value={email}
              disabled={isEdit}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="persona@ejemplo.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Áreas ({departments.length})</Label>
            <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-2 sm:grid-cols-3">
              {available.map((department) => {
                const checked = departments.includes(department);
                return (
                  <label
                    key={department}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs transition-colors hover:bg-surface-2"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) =>
                        setDepartments((current) =>
                          next === true ? [...current, department] : current.filter((value) => value !== department),
                        )
                      }
                    />
                    <DepartmentDot department={department} />
                    <span className="truncate">{DEPARTMENT_LABELS[department]}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-[11px] text-fg-subtle">
              Una persona puede llevar varias áreas a la vez; verá y podrá responder por todas ellas.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="person-role">Rol</Label>
            <Select id="person-role" value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
              {assignableRoles.map((value) => (
                <option key={value} value={value}>
                  {USER_ROLE_LABELS[value]}
                </option>
              ))}
            </Select>
            <p className="text-[11px] text-fg-subtle">
              {role === 'MEMBER'
                ? 'Trabaja en las iniciativas de sus áreas; no da de alta a nadie.'
                : role === 'LEAD'
                  ? 'Además puede añadir miembros a sus áreas, firmar avances excepcionales y configurar sus compuertas.'
                  : 'Alcance total: personas, roles, áreas y parámetros del sistema.'}
            </p>
          </div>

          <ActionError message={grant.error ?? update.error} />
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {isEdit ? 'Guardar cambios' : 'Dar acceso'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Supresión RGPD: irreversible, y por eso pide motivo y avisa de lo que conserva. */
function AnonymizeDialog({ row, onClose }: { row: AccessRow; onClose: () => void }) {
  const anonymize = useAction(anonymizeUserAction);
  const [reason, setReason] = React.useState('');

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="w-[min(30rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle className="text-[var(--danger)]">Anonimizar a {row.name}</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <div className="tone-warning rounded-md px-2.5 py-2 text-xs leading-relaxed">
            Su nombre y su correo se sustituyen por un identificador opaco y no hay vuelta atrás. Los eventos que
            firmó siguen en la caja negra atribuidos a ese identificador: la trazabilidad de quién autorizó qué no se
            rompe.
          </div>

          <div className="space-y-1.5">
            <SectionLabel>Motivo</SectionLabel>
            <Textarea
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ejercicio del derecho de supresión solicitado el…"
            />
          </div>

          <ActionError message={anonymize.error} />
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={reason.trim().length < 10 || anonymize.isPending}
            onClick={() => anonymize.run({ userId: row.id, reason }, onClose)}
          >
            Anonimizar definitivamente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
