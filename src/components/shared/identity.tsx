import type { Department } from '@/domain/enums';
import { DepartmentChip } from '@/components/shared/signals';
import { Avatar, Badge } from '@/components/ui/primitives';

export interface IdentityUser {
  name: string;
  email: string;
  role: string;
  departments: Department[];
}

/**
 * «Quién soy aquí»: nombre, rol y áreas a las que pertenece la sesión. Es lo
 * que permite saber de un vistazo desde qué departamento se está trabajando
 * (y por tanto qué se puede avanzar, asignar o marcar).
 */
export function IdentityCard({ user, showEmail = false }: { user: IdentityUser; showEmail?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <Avatar name={user.name} className="mt-0.5 size-8 text-xs" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium text-fg">{user.name}</p>
        {showEmail ? <p className="truncate text-xs text-fg-subtle">{user.email}</p> : null}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge tone="accent">{user.role}</Badge>
          {user.departments.map((department) => (
            <DepartmentChip key={department} department={department} short />
          ))}
        </div>
      </div>
    </div>
  );
}
