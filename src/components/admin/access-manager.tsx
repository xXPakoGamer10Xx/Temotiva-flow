'use client';

import * as React from 'react';
import { ShieldCheck, ShieldOff, UserPlus } from 'lucide-react';
import type { Department, UserRole } from '@/domain/enums';
import { DEPARTMENTS, USER_ROLES } from '@/domain/enums';
import { DEPARTMENT_LABELS, USER_ROLE_LABELS } from '@/domain/labels';
import { grantAccessAction, setAccessActiveAction, updateAccessAction } from '@/server/actions/administration';
import { ActionError, useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Input, Label, Select } from '@/components/ui/primitives';

export interface AccessRow {
  id: string;
  name: string;
  email: string;
  department: Department;
  role: UserRole;
  isActive: boolean;
}

/**
 * Allowlist de acceso: la única puerta de entrada al sistema.
 *
 * Como el equipo son colaboradores externos con cuentas de Google propias, el
 * dominio del correo no autoriza nada: autoriza estar en esta lista y activo.
 * Una baja surte efecto en la siguiente petición, sin esperar a que caduque la
 * sesión.
 */
export function AccessManager({ rows, currentUserId }: { rows: AccessRow[]; currentUserId: string }) {
  const grant = useAction(grantAccessAction);
  const update = useAction(updateAccessAction);
  const toggle = useAction(setAccessActiveAction);

  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [department, setDepartment] = React.useState<Department>('TECH');
  const [role, setRole] = React.useState<UserRole>('MEMBER');

  const submit = (): void => {
    grant.run({ name, email, department, role }, () => {
      setName('');
      setEmail('');
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold">Dar acceso a una persona</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="access-name">Nombre</Label>
            <Input id="access-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="access-email">Correo de su cuenta de Google</Label>
            <Input
              id="access-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="persona@ejemplo.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="access-department">Departamento</Label>
            <Select
              id="access-department"
              value={department}
              onChange={(event) => setDepartment(event.target.value as Department)}
            >
              {DEPARTMENTS.map((value) => (
                <option key={value} value={value}>
                  {DEPARTMENT_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="access-role">Rol</Label>
            <Select id="access-role" value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
              {USER_ROLES.map((value) => (
                <option key={value} value={value}>
                  {USER_ROLE_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <ActionError message={grant.error} />

        <Button size="sm" onClick={submit} disabled={grant.isPending || !name || !email}>
          <UserPlus className="size-4" />
          {grant.isPending ? 'Guardando…' : 'Conceder acceso'}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Debe ser el correo exacto de la cuenta de Google con la que iniciará sesión. Cualquier otro correo es
          rechazado en el servidor.
        </p>
      </div>

      <ActionError message={update.error ?? toggle.error} />

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Persona</th>
              <th scope="col" className="px-3 py-2 font-medium">Departamento</th>
              <th scope="col" className="px-3 py-2 font-medium">Rol</th>
              <th scope="col" className="px-3 py-2 font-medium">Acceso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className={row.isActive ? '' : 'opacity-60'}>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Avatar name={row.name} />
                    <div>
                      <p className="font-medium">{row.name}</p>
                      <p className="text-[11px] text-muted-foreground">{row.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <Select
                    value={row.department}
                    aria-label={`Departamento de ${row.name}`}
                    disabled={update.isPending}
                    onChange={(event) =>
                      update.run({ userId: row.id, department: event.target.value as Department })
                    }
                    className="h-8 text-xs"
                  >
                    {DEPARTMENTS.map((value) => (
                      <option key={value} value={value}>
                        {DEPARTMENT_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-3 py-2.5">
                  <Select
                    value={row.role}
                    aria-label={`Rol de ${row.name}`}
                    disabled={update.isPending}
                    onChange={(event) => update.run({ userId: row.id, role: event.target.value as UserRole })}
                    className="h-8 text-xs"
                  >
                    {USER_ROLES.map((value) => (
                      <option key={value} value={value}>
                        {USER_ROLE_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Badge tone={row.isActive ? 'success' : 'neutral'}>{row.isActive ? 'Activo' : 'De baja'}</Badge>
                    {row.id === currentUserId ? (
                      <span className="text-[11px] text-muted-foreground">(tú)</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={toggle.isPending}
                        onClick={() => toggle.run({ userId: row.id, isActive: !row.isActive })}
                      >
                        {row.isActive ? <ShieldOff className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
                        {row.isActive ? 'Revocar' : 'Reactivar'}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
